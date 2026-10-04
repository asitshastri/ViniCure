import { withApi } from "@/lib/api/with-api";
import { adminRefundBody, getPayments, paymentIdParams } from "@/modules/payments";

// Admin: refund a received payment, in full or in part (P5-07). Needs a recent sign-in and an
// Idempotency-Key (a repeat is the same refund). The amount is capped by what is left; the
// ledger and the payment total follow when the gateway confirms the refund.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/admin/payments/:id/refund",
    auth: "staff",
    roles: ["admin", "super_admin"],
    roleDenied: "not_found",
    rateLimit: "admin",
    freshLogin: true,
    idempotent: true,
    params: paymentIdParams,
    body: adminRefundBody,
    audit: { action: "payment.refund", entity: "payment" },
    doc: { summary: "Refund a payment, in full or in part", tags: ["payments", "admin"] },
  },
  async ({ actor, params, body, request }) =>
    getPayments().refundAsAdmin(
      actor,
      params.id,
      body,
      request.headers.get("idempotency-key") ?? "",
    ),
);
