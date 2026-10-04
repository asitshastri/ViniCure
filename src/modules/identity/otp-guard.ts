import type { CaptchaVerifier } from "../../lib/adapters/types";
import { AdapterError } from "../../lib/adapters/types";
import { clientIp } from "../../lib/api/with-api";
import type { RateLimitDecision, RateLimitInput } from "../../lib/api/types";
import { cacheKey, type CacheStore } from "../../lib/cache/cache";
import { AppError, errors, isAppError } from "../../lib/errors/app-error";
import { isAllowedPhone } from "./phone";

// OTP abuse controls (P2-04). SMS cost abuse is a business-flow risk (OWASP API6): a bot that
// asks for codes costs real money and can harass a stranger's phone. Every request to send or
// check a code passes this guard before Better Auth sees it:
//
//   send-otp   address limit, phone limit, captcha, daily SMS budget
//   verify     address limit, phone limit (Better Auth also locks a code after 3 wrong tries)
//
// The limits come from TIER_RULES (src/lib/rate-limit): otp_send 3 per 10 minutes per phone and
// 10 per hour per address; otp_verify 10 per 10 minutes per phone and 30 per 10 minutes per
// address. Failure behavior: if the cache is down, in production the request is refused (fail
// closed). If the captcha provider is down, no SMS is sent. In development without a captcha
// secret the check is skipped with a warning; production refuses to send.

export const SEND_OTP_PATH = "/phone-number/send-otp";
export const VERIFY_OTP_PATH = "/phone-number/verify";
export const CAPTCHA_HEADER = "x-captcha-token";

const MAX_BODY_BYTES = 2048;
const DAY_MS = 24 * 60 * 60 * 1000;
const BUDGET_WARN_FRACTION = 0.8;

export type OtpLimiter = {
  check: (input: RateLimitInput) => Promise<RateLimitDecision>;
  checkPhone: (input: {
    tier: "otp_send" | "otp_verify";
    phone: string;
  }) => Promise<RateLimitDecision>;
};

export type OtpGuardDeps = {
  limiter: OtpLimiter;
  captcha?: CaptchaVerifier;
  cache: CacheStore;
  env: string;
  /** Maximum SMS per UTC day, all patients together. */
  dailySmsCap: number;
  allowedCountryCodes: readonly string[];
  production: boolean;
  trustedProxyHops?: number;
  /** Security events: sms_budget_warning, sms_budget_exhausted, captcha_failed, ... No personal data. */
  alert: (event: string, data?: Record<string, unknown>) => void;
  now?: () => Date;
};

type Which = "send" | "verify";

function which(request: Request): Which | null {
  if (request.method !== "POST") return null;
  const path = new URL(request.url).pathname;
  if (path.endsWith(`/api/auth${SEND_OTP_PATH}`)) return "send";
  if (path.endsWith(`/api/auth${VERIFY_OTP_PATH}`)) return "verify";
  return null;
}

async function readPhone(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
    throw new AppError("payload_too_large");
  const text = await request.clone().text();
  if (text.length > MAX_BODY_BYTES) throw new AppError("payload_too_large");
  try {
    const body = JSON.parse(text) as { phoneNumber?: unknown };
    return typeof body.phoneNumber === "string" ? body.phoneNumber : null;
  } catch {
    return null;
  }
}

function enforce(decision: RateLimitDecision, alert: OtpGuardDeps["alert"], tier: string): void {
  if (decision.allowed) return;
  alert("rate_limited", { tier });
  throw errors.rateLimited(decision.retryAfterSeconds);
}

/** Throws an AppError when the OTP request must not go on. Passes silently for other routes. */
export async function guardOtpRequest(request: Request, deps: OtpGuardDeps): Promise<void> {
  const kind = which(request);
  if (!kind) return;

  const tier = kind === "send" ? "otp_send" : "otp_verify";
  const ip = clientIp(request, deps.trustedProxyHops);

  try {
    // 1. Address limit, before reading the body or calling anyone.
    enforce(
      await deps.limiter.check({
        tier,
        route: `/api/auth${kind === "send" ? SEND_OTP_PATH : VERIFY_OTP_PATH}`,
        ip,
      }),
      deps.alert,
      tier,
    );

    // 2. A phone number that can never receive a code is a validation error, not SMS spend.
    const phone = await readPhone(request);
    if (phone === null || !isAllowedPhone(phone, deps.allowedCountryCodes)) {
      throw errors.validation([{ path: "phoneNumber", message: "Enter a valid mobile number." }]);
    }

    // 3. Phone limit.
    enforce(await deps.limiter.checkPhone({ tier, phone }), deps.alert, tier);

    if (kind === "verify") return;

    // 4. Captcha.
    await checkCaptcha(request, ip, deps);

    // 5. Daily SMS budget.
    await spendSmsBudget(deps);
  } catch (error) {
    if (isAppError(error)) throw error;
    // Cache or captcha outage.
    deps.alert("otp_guard_unavailable", { tier });
    if (deps.production) throw errors.unavailable({ cause: error });
    // Development: a missing cache must not block local work, but a captcha failure still does.
    if (error instanceof AdapterError) throw errors.unavailable({ cause: error });
  }
}

async function checkCaptcha(request: Request, ip: string, deps: OtpGuardDeps): Promise<void> {
  if (!deps.captcha) {
    if (deps.production) {
      deps.alert("captcha_not_configured");
      throw errors.unavailable({ cause: new Error("captcha is not configured") });
    }
    deps.alert("captcha_skipped_in_development");
    return;
  }
  const token = request.headers.get(CAPTCHA_HEADER);
  if (!token) throw new AppError("captcha_failed");
  const { success } = await deps.captcha.verify({ token, ip });
  if (!success) {
    deps.alert("captcha_failed");
    throw new AppError("captcha_failed");
  }
}

async function spendSmsBudget(deps: OtpGuardDeps): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  const day = now.toISOString().slice(0, 10);
  // The window outlives the UTC day a little, so the counter is gone by the time it is unused.
  const { count } = await deps.cache.incrWindow(
    cacheKey(deps.env, "sms", "budget", day),
    DAY_MS + 60 * 60 * 1000,
  );
  if (count > deps.dailySmsCap) {
    // Alert once per day, not once per request.
    if (
      await deps.cache.setIfAbsent(cacheKey(deps.env, "sms", "budget", "alerted", day), "1", DAY_MS)
    ) {
      deps.alert("sms_budget_exhausted", { cap: deps.dailySmsCap });
    }
    throw errors.unavailable({ detail: "Sign-in codes are paused for now. Try again later." });
  }
  if (count >= Math.ceil(deps.dailySmsCap * BUDGET_WARN_FRACTION)) {
    if (
      await deps.cache.setIfAbsent(cacheKey(deps.env, "sms", "budget", "warned", day), "1", DAY_MS)
    ) {
      deps.alert("sms_budget_warning", { used: count, cap: deps.dailySmsCap });
    }
  }
}
