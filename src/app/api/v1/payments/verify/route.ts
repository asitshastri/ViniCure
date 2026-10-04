import { withApi } from "@/lib/api/with-api";
import { getPayments, verifyBody } from "@/modules/payments";

// The checkout widget finished (P5-04). The browser sends what the widget returned; the server
// checks the signature, asks the gateway what really happened, and settles the payment. Safe to
// repeat. The same settlement runs when the webhook arrives, in either order.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/payments/verify",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "payments",
    body: verifyBody,
    audit: { action: "payment.verify", entity: "payment" },
    doc: { summary: "Confirm a payment after checkout", tags: ["payments"] },
  },
  async ({ actor, body }) => getPayments().verify(actor, body),
);
