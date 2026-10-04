import { createHmac } from "node:crypto";
import { clientIp } from "../../lib/api/with-api";
import type { RateLimitDecision, RateLimitInput } from "../../lib/api/types";
import { cacheKey, type CacheStore } from "../../lib/cache/cache";
import { AppError, errors } from "../../lib/errors/app-error";

// Brute-force protection for staff passwords (P2-15). Rules:
//   - one address: 30 password attempts per 15 minutes (tier "sign_in"), whatever the result
//   - one account: 5 wrong passwords within 15 minutes lock the account's password sign-in
//     for 15 minutes; each further lock-out within 24 hours doubles the time, up to 24 hours
//   - a correct password clears the failure count (not the lock-out history)
//   - the same answer and the same counting for an email that has no account, so the lock-out
//     reveals nothing about which accounts exist
//   - the "change password" step counts wrong current passwords the same way, per session
// If the cache is down in production, password sign-in is refused (fail closed).
// The second step (authenticator code) has its own lock-out inside the two-factor plugin.

export const SIGN_IN_PATH = "/sign-in/email";
export const CHANGE_PASSWORD_PATH = "/change-password";
export const RESET_REQUEST_PATH = "/request-password-reset";
export const RESET_PATH = "/reset-password";
/** One address may ask for 3 reset emails per hour (the address limit is 3 per 15 minutes). */
export const MAX_RESET_EMAILS_PER_HOUR = 3;
/** A reset request always takes at least this long, whether or not the email has an account. */
export const MIN_RESET_RESPONSE_MS = 400;
export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 15 * 60_000;
export const BASE_LOCK_MS = 15 * 60_000;
export const MAX_LOCK_MS = 24 * 60 * 60_000;
const LEVEL_WINDOW_MS = 24 * 60 * 60_000;
const MAX_BODY_BYTES = 4096;

export type SignInGuardDeps = {
  limiter: { check: (input: RateLimitInput) => Promise<RateLimitDecision> };
  cache: CacheStore;
  env: string;
  hashSecret: string;
  production: boolean;
  trustedProxyHops?: number;
  /** Security events (no personal data): signin_locked, signin_guard_unavailable. */
  alert: (event: string, data?: Record<string, unknown>) => void;
};

/** What to call with the response once Better Auth has answered. */
export type AfterResponse = (response: Response) => Promise<void>;

const lockDuration = (level: number) =>
  Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** Math.max(0, level - 1));

function subjectKey(deps: SignInGuardDeps, kind: string, subject: string): string[] {
  const id = createHmac("sha256", `signin:${deps.hashSecret}`)
    .update(subject)
    .digest("hex")
    .slice(0, 40);
  const k = (part: string) => cacheKey(deps.env, "signin", kind, part, id);
  return [k("fails"), k("lock"), k("level")];
}

async function readEmail(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
    throw new AppError("payload_too_large");
  const text = await request.clone().text();
  if (text.length > MAX_BODY_BYTES) throw new AppError("payload_too_large");
  try {
    const email = (JSON.parse(text) as { email?: unknown }).email;
    return typeof email === "string" ? email.trim().toLowerCase().slice(0, 254) : null;
  } catch {
    return null;
  }
}

/**
 * Runs before Better Auth for password sign-in and password change. Throws an AppError when the
 * attempt must stop. Returns a function that records the outcome, or null for other routes.
 */
export async function guardSignIn(
  request: Request,
  deps: SignInGuardDeps,
): Promise<AfterResponse | null> {
  if (request.method !== "POST") return null;
  const pathname = new URL(request.url).pathname;
  const isSignIn = pathname.endsWith(`/api/auth${SIGN_IN_PATH}`);
  const isChange = pathname.endsWith(`/api/auth${CHANGE_PASSWORD_PATH}`);
  const isResetRequest = pathname.endsWith(`/api/auth${RESET_REQUEST_PATH}`);
  const isReset = pathname.endsWith(`/api/auth${RESET_PATH}`);
  if (!isSignIn && !isChange && !isResetRequest && !isReset) return null;
  const started = Date.now();

  try {
    const decision = await deps.limiter.check({
      tier: isResetRequest ? "password_reset" : "sign_in",
      route: pathname,
      ip: clientIp(request, deps.trustedProxyHops),
    });
    if (!decision.allowed) throw errors.rateLimited(decision.retryAfterSeconds);

    if (isReset) return null; // the token is the credential; the address limit above is enough

    if (isResetRequest) {
      const email = await readEmail(request);
      if (email) {
        const [mailKey] = subjectKey(deps, "reset-email", email);
        const { count } = await deps.cache.incrWindow(mailKey as string, 60 * 60_000);
        // Counted for every address, real or not, so the answer reveals nothing.
        if (count > MAX_RESET_EMAILS_PER_HOUR) throw errors.rateLimited(60 * 60);
      }
      // Same time for every address: wait out the rest of the minimum.
      return async () => {
        const wait = MIN_RESET_RESPONSE_MS - (Date.now() - started);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      };
    }

    // Sign-in counts by the email typed; a password change counts by the session cookie.
    const subject = isSignIn
      ? await readEmail(request)
      : (request.headers.get("cookie") ?? "").slice(0, 600) || null;
    if (!subject) return null; // nothing to count against: Better Auth will refuse the request

    const [failsKey, lockKey, levelKey] = subjectKey(deps, isSignIn ? "email" : "session", subject);
    const lock = await deps.cache.peekWindow(lockKey as string);
    if (lock.count > 0) throw errors.rateLimited(Math.ceil(lock.ttlMs / 1000));

    return async (response) => {
      try {
        if (response.ok) {
          await deps.cache.del(failsKey as string);
          return;
        }
        // Any refusal counts: wrong password, unknown email, unverified, no authenticator.
        const { count } = await deps.cache.incrWindow(failsKey as string, FAILURE_WINDOW_MS);
        if (count < MAX_FAILURES) return;
        const { count: level } = await deps.cache.incrWindow(levelKey as string, LEVEL_WINDOW_MS);
        await deps.cache.incrWindow(lockKey as string, lockDuration(level));
        await deps.cache.del(failsKey as string);
        deps.alert("signin_locked", { level, kind: isSignIn ? "sign_in" : "change_password" });
      } catch {
        // Recording is best effort: the response has already been decided.
        deps.alert("signin_guard_unavailable", { phase: "record" });
      }
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    deps.alert("signin_guard_unavailable", { phase: "check" });
    if (deps.production) throw errors.unavailable({ cause: error });
    return null;
  }
}
