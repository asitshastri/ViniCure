import type { CacheStore } from "../cache/cache";
import { cacheKey, hashKeyPart } from "../cache/cache";
import type { RateLimitDecision, RateLimitInput, RateLimitTier } from "../api/types";

// Rate limiter (backend-architecture.md section 5). Fixed-window counters kept in
// Valkey, so the limit holds across tasks and survives an app restart.
//
// A tier is a list of rules. Each rule counts one kind of subject (address, user,
// phone number) in a window. A request is allowed only when every rule that
// applies still has room; the answer reports the rule that blocked it.
//
// Fixed windows allow a short burst of up to twice the limit across a window
// boundary. That is accepted for these tiers; the sensitive ones (OTP, sign-in,
// payments) also have per-code and per-day caps elsewhere.

export type Subject = "ip" | "user" | "phone";

export type Rule = {
  subject: Subject;
  limit: number;
  windowMs: number;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const TIER_RULES: Record<RateLimitTier, Rule[]> = {
  public_read: [{ subject: "ip", limit: 120, windowMs: MINUTE }],
  auth_read: [{ subject: "user", limit: 300, windowMs: MINUTE }],
  write: [{ subject: "user", limit: 60, windowMs: MINUTE }],
  otp_send: [
    { subject: "phone", limit: 3, windowMs: 10 * MINUTE },
    { subject: "ip", limit: 10, windowMs: HOUR },
  ],
  otp_verify: [
    { subject: "phone", limit: 10, windowMs: 10 * MINUTE },
    { subject: "ip", limit: 30, windowMs: 10 * MINUTE },
  ],
  // Password sign-in attempts from one address, counted whatever the result. The per-account
  // failure lock-out lives in modules/identity/sign-in-guard.ts.
  sign_in: [{ subject: "ip", limit: 30, windowMs: 15 * MINUTE }],
  // Staff password reset requests: 3 per 15 minutes per address (P2-16). The per-email cap
  // (3 per hour) is in modules/identity/sign-in-guard.ts.
  password_reset: [{ subject: "ip", limit: 3, windowMs: 15 * MINUTE }],
  payments: [{ subject: "user", limit: 10, windowMs: MINUTE }],
  // Entering referral codes: few tries per person per hour, so a code cannot be guessed (P5-10).
  referral: [{ subject: "user", limit: 10, windowMs: HOUR }],
  // Signed gateway callbacks arrive from a few addresses in bursts; the signature is the real
  // gate. If the cache is down the callback is still accepted (the gateway would only retry).
  webhook: [{ subject: "ip", limit: 600, windowMs: MINUTE }],
  ai: [{ subject: "user", limit: 5, windowMs: HOUR }],
  admin: [{ subject: "user", limit: 120, windowMs: MINUTE }],
};

/** Before sign-in is known, a user-scoped tier is guarded by address at this multiple of its limit. */
const PRE_AUTH_FACTOR = 5;

export type LimiterMetrics = (
  event: "allowed" | "limited",
  labels: { tier: RateLimitTier; subject: Subject },
) => void;

export type LimiterOptions = {
  cache: CacheStore;
  /** Environment name in cache keys, for example "production". */
  env: string;
  /** Secret for hashing identifiers such as phone numbers before they reach the cache. */
  hashSecret: string;
  rules?: Record<RateLimitTier, Rule[]>;
  metrics?: LimiterMetrics;
};

export type PhoneInput = { tier: RateLimitTier; phone: string; ip?: string };

export class RateLimiter {
  private readonly rules: Record<RateLimitTier, Rule[]>;

  constructor(private readonly options: LimiterOptions) {
    this.rules = options.rules ?? TIER_RULES;
  }

  /** The hook withApi() calls. Throws if the cache is unreachable; withApi decides fail open or closed. */
  readonly check = async (input: RateLimitInput): Promise<RateLimitDecision> => {
    const rules = this.rules[input.tier].flatMap((rule): Rule[] => {
      if (rule.subject === "phone") return []; // phone is supplied by the route itself, see checkPhone
      if (rule.subject === "user" && input.userId === undefined) {
        // Not signed in yet: guard by address with a generous floor.
        return [{ subject: "ip", limit: rule.limit * PRE_AUTH_FACTOR, windowMs: rule.windowMs }];
      }
      return [rule];
    });
    return this.evaluate(input.tier, rules, {
      ip: input.ip,
      user: input.userId,
      route: input.route,
    });
  };

  /** For OTP routes: the phone number is in the body, so the route calls this after parsing it. */
  async checkPhone(input: PhoneInput): Promise<RateLimitDecision> {
    const rules = this.rules[input.tier].filter((rule) => rule.subject === "phone");
    return this.evaluate(input.tier, rules, { phone: input.phone });
  }

  private async evaluate(
    tier: RateLimitTier,
    rules: Rule[],
    subjects: { ip?: string; user?: string; phone?: string; route?: string },
  ): Promise<RateLimitDecision> {
    let worst: RateLimitDecision | undefined;
    let minRemaining: RateLimitDecision | undefined;

    for (const rule of rules) {
      const id =
        rule.subject === "ip"
          ? subjects.ip
          : rule.subject === "user"
            ? subjects.user
            : subjects.phone;
      if (!id) continue;
      const part =
        rule.subject === "phone" ? hashKeyPart(id, this.options.hashSecret) : hashKeyPart(id, "rl");
      const key = cacheKey(this.options.env, "rl", tier, rule.subject, String(rule.windowMs), part);
      const { count, ttlMs } = await this.options.cache.incrWindow(key, rule.windowMs);
      const allowed = count <= rule.limit;
      const decision: RateLimitDecision = {
        allowed,
        limit: rule.limit,
        remaining: Math.max(0, rule.limit - count),
        retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(ttlMs / 1000)),
      };
      this.options.metrics?.(allowed ? "allowed" : "limited", { tier, subject: rule.subject });
      if (!allowed && (!worst || decision.retryAfterSeconds > worst.retryAfterSeconds))
        worst = decision;
      if (!minRemaining || decision.remaining < minRemaining.remaining) minRemaining = decision;
    }
    return worst ?? minRemaining ?? { allowed: true, limit: 0, remaining: 0, retryAfterSeconds: 0 };
  }
}
