import { randomInt } from "node:crypto";
import { errors } from "../../lib/errors/app-error";
import { logger } from "../../lib/logging/logger";
import { uuidv7 } from "../../lib/ids";
import { assertAllowed, can, type Principal } from "../identity/policy";
import type { ReferralRepo } from "./repo";
import { CODE_ALPHABET, CODE_LENGTH, type RedeemBody, type ReferralSummary } from "./schemas";

// Referrals (P5-10), behind the `referrals` flag: off means every route answers as if it did
// not exist. Rules that stop farming: a person is referred once, never by themselves or by
// someone they referred, only before their first consultation, and a person can refer only a
// fixed number of people. Every refusal reads the same, so the answer says nothing about which
// rule applied or whether a code exists.

type Deps = {
  repo: ReferralRepo;
  enabled: () => boolean;
  /** How many people one person may refer. */
  cap: () => number;
  /** The reward for each referral, in paise, stored when the referral is made. */
  rewardPaise: () => number;
};

export function newCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export class ReferralService {
  constructor(private readonly deps: Deps) {}

  private guard(principal: Principal, action: "read" | "redeem"): void {
    // A switched-off feature is a missing feature.
    if (!this.deps.enabled()) throw errors.notFound();
    assertAllowed(can.referral[action](principal, { ownerUserId: principal.userId }));
  }

  /** The account's code (made on first ask), what it has earned, and whether it may enter a code. */
  async summary(principal: Principal): Promise<ReferralSummary> {
    this.guard(principal, "read");
    let code = await this.deps.repo.codeFor(principal.userId);
    // A new code can collide with another person's (rare); try a few times.
    for (let attempt = 0; !code && attempt < 5; attempt++) {
      const candidate = newCode();
      if (await this.deps.repo.insertCode(principal.userId, candidate)) code = candidate;
      else code = await this.deps.repo.codeFor(principal.userId);
    }
    if (!code) throw errors.unavailable();
    const [counts, state] = await Promise.all([
      this.deps.repo.counts(principal.userId),
      this.deps.repo.redeemState(principal.userId),
    ]);
    return {
      code,
      ...counts,
      cap: this.deps.cap(),
      rewardPaise: this.deps.rewardPaise(),
      canRedeem: !state.referred && !state.hasBooking,
    };
  }

  /** Someone enters a friend's code. Every way this can fail gives the same answer. */
  async redeem(principal: Principal, input: RedeemBody): Promise<{ accepted: true }> {
    this.guard(principal, "redeem");
    const outcome = await this.deps.repo.redeem({
      id: uuidv7(),
      referredUserId: principal.userId,
      code: input.code,
      cap: this.deps.cap(),
      rewardPaise: this.deps.rewardPaise(),
    });
    if (outcome !== "created") {
      // The reason is kept for us, never shown.
      logger.warn({ event: "referral_refused", reason: outcome });
      throw errors.conflict({ detail: "This code cannot be used." });
    }
    logger.info({ event: "referral_made" });
    return { accepted: true };
  }

  /** The referred person's first consultation was completed (called by the consultation flow, P6). */
  async onFirstConsultationCompleted(referredUserId: string): Promise<number | null> {
    if (!this.deps.enabled()) return null;
    return this.deps.repo.reward(referredUserId);
  }
}
