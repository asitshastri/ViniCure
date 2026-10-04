// Risk-based step-up for phone sign-in (P2-18, decision D-019).
//
// A phone code proves the person holds the SIM today. It does not prove they are the person who
// opened the account: a number that was given up is sold to someone new after about 90 days. So
// a phone-only sign-in is trusted only when nothing looks different from the last time.
//
// It is HIGH risk when any of these is true (values are read before this sign-in updates them):
//   new_device     this browser is not one the patient unlocked with a second method (or was
//                  registered when the account was created) in the last 30 days
//   long_idle      no sign-in for 90 days or more
//   stale_phone    the number was last proven 180 days ago or more
//   number_changed the number was changed in the last 30 days
//   flagged        the patient (or support) said "this was not me" and no second method has
//                  been proven since
// A brand-new account has nothing to protect yet and is never high risk.
//
// High risk gives a LIMITED session: nothing stored about the patient can be read (profiles,
// appointments, records, prescriptions, documents, payments) and nothing can be changed or
// exported, until a second method that already existed is proven: Google, or a recovery code.

export const IDLE_DAYS = 90;
export const PHONE_STALE_DAYS = 180;
export const NUMBER_CHANGE_DAYS = 30;
export const TRUSTED_DEVICE_DAYS = 30;

export type RiskReason = "new_device" | "long_idle" | "stale_phone" | "number_changed" | "flagged";

export type RiskInput = {
  now: Date;
  /** The browser carries a cookie matching a live trusted device of this account. */
  knownDevice: boolean;
  /** The account was created by this very sign-in. */
  brandNewAccount: boolean;
  lastActiveAt: Date | null;
  phoneVerifiedAt: Date | null;
  phoneChangedAt: Date | null;
  forceStepUpAt: Date | null;
};

export type RiskAssessment = { high: boolean; reasons: RiskReason[] };

const DAY = 24 * 60 * 60 * 1000;
const olderThan = (when: Date | null, days: number, now: Date) =>
  when !== null && now.getTime() - when.getTime() >= days * DAY;
const within = (when: Date | null, days: number, now: Date) =>
  when !== null && now.getTime() - when.getTime() < days * DAY;

export function assessRisk(input: RiskInput): RiskAssessment {
  if (input.brandNewAccount) return { high: false, reasons: [] };
  const reasons: RiskReason[] = [];
  if (!input.knownDevice) reasons.push("new_device");
  if (olderThan(input.lastActiveAt, IDLE_DAYS, input.now)) reasons.push("long_idle");
  if (olderThan(input.phoneVerifiedAt, PHONE_STALE_DAYS, input.now)) reasons.push("stale_phone");
  if (within(input.phoneChangedAt, NUMBER_CHANGE_DAYS, input.now)) reasons.push("number_changed");
  if (input.forceStepUpAt !== null) reasons.push("flagged");
  return { high: reasons.length > 0, reasons };
}
