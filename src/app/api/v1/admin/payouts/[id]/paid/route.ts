import { withApi } from "@/lib/api/with-api";
import { getPayouts, markPaidBody, payoutIdParams } from "@/modules/payments";

// Admin: record that a payout was sent (P5-09). Needs a recent sign-in. Once only.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/admin/payouts/:id/paid",
    auth: "staff",
    roles: ["admin", "super_admin"],
    roleDenied: "not_found",
    rateLimit: "admin",
    freshLogin: true,
    params: payoutIdParams,
    body: markPaidBody,
    audit: { action: "payout.paid", entity: "payout" },
    doc: { summary: "Mark a payout as paid", tags: ["payments", "admin"] },
  },
  async ({ actor, params, body }) => getPayouts().markPaid(actor, params.id, body),
);
