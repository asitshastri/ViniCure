import { z } from "zod";

// Consent (P6-05). What a person must agree to before a video consultation, and their answer.
// Inputs are strict; outputs are allow-lists.

/** What must be on record, for this patient, before the first join. */
export const JOIN_CONSENT_KINDS = ["telemedicine", "video"] as const;
export type JoinConsentKind = (typeof JOIN_CONSENT_KINDS)[number];

export const grantConsentsBody = z.object({ policyIds: z.array(z.uuid()).min(1).max(5) }).strict();
export type GrantConsentsBody = z.infer<typeof grantConsentsBody>;

export const consentIdParams = z.object({ id: z.uuid() }).strict();

/** One text the person is asked to agree to. */
export type ConsentPolicyView = {
  policyId: string;
  kind: string;
  version: string;
  language: string;
  body: string;
};

export type JoinConsentView = {
  /** Texts still to be agreed to. Empty means the person can join. */
  required: ConsentPolicyView[];
};
