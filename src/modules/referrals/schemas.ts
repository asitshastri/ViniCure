import { z } from "zod";

// Referrals (P5-10). Strict inputs; outputs are allow-lists that never name the people invited.

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

/** Codes are typed by people: spaces and lower case are forgiven, anything else is not. */
export const redeemBody = z
  .object({
    code: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/, "That is not a referral code.")),
  })
  .strict();
export type RedeemBody = z.infer<typeof redeemBody>;

export type ReferralSummary = {
  code: string;
  /** People who joined with this code (waiting or rewarded). */
  invited: number;
  rewarded: number;
  /** How many people one person may refer. */
  cap: number;
  /** The reward for each, in paise. Shown only; how it is paid is the business's decision. */
  rewardPaise: number;
  /** This account may still enter someone's code (it has not been referred and has not booked). */
  canRedeem: boolean;
};
