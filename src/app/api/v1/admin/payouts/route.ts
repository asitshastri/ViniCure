import { withApi } from "@/lib/api/with-api";
import { getPayouts, payoutPeriodBody } from "@/modules/payments";

// Admin: claim what each doctor is owed up to the end of a finished period (P5-09). Asking again
// for the same period creates nothing new. Needs a recent sign-in.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/admin/payouts",
    auth: "staff",
    roles: ["admin", "super_admin"],
    roleDenied: "not_found",
    rateLimit: "admin",
    freshLogin: true,
    body: payoutPeriodBody,
    audit: { action: "payout.create", entity: "payout" },
    doc: { summary: "Create the payouts for a finished period", tags: ["payments", "admin"] },
  },
  async ({ actor, body }) => getPayouts().create(actor, body),
);
