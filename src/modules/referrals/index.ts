import { getConfig } from "../../lib/config/config";
import { isEnabled } from "../../lib/config/flags";
import { getDatabase, queryable, txRunner } from "../../lib/db/pool";
import { globalSingleton } from "../../lib/singleton";
import { ReferralRepo } from "./repo";
import { ReferralService } from "./service";

export * from "./schemas";
export { ReferralService } from "./service";

const holder = globalSingleton("referrals", () => ({
  service: undefined as ReferralService | undefined,
}));

export function getReferrals(): ReferralService {
  holder.service ??= new ReferralService({
    repo: new ReferralRepo(queryable(getDatabase()), txRunner()),
    enabled: () => isEnabled("referrals"),
    cap: () => getConfig().REFERRAL_MAX_PER_REFERRER,
    rewardPaise: () => getConfig().REFERRAL_REWARD_PAISE,
  });
  return holder.service;
}

/** Replaces the service (tests). Pass undefined to reset. */
export function setReferralsForTest(service: ReferralService | undefined): void {
  holder.service = service;
}
