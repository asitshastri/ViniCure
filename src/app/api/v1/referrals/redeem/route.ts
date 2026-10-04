import { withApi } from "@/lib/api/with-api";
import { getReferrals, redeemBody } from "@/modules/referrals";

// A new patient enters a friend's code (P5-10). Behind the `referrals` flag. Every refusal gives
// the same answer. Rate limited per person, failing closed, so codes cannot be guessed.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/referrals/redeem",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "referral",
    body: redeemBody,
    audit: { action: "referral.redeem", entity: "referral" },
    doc: { summary: "Use a friend's referral code", tags: ["referrals"] },
  },
  async ({ actor, body }) => getReferrals().redeem(actor, body),
);
