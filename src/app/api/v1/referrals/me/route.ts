import { withApi } from "@/lib/api/with-api";
import { getReferrals } from "@/modules/referrals";

// The patient's referral code and what it has earned (P5-10). Behind the `referrals` flag: when
// it is off this route answers 404. Never names the people invited.

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/referrals/me",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "referral",
    doc: { summary: "My referral code and what it has earned", tags: ["referrals"] },
  },
  async ({ actor }) => getReferrals().summary(actor),
);
