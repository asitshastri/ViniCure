import { withApi } from "@/lib/api/with-api";
import { createOrderBody, getPayments } from "@/modules/payments";

// Start a payment for a held appointment (P5-03). The body names the appointment and nothing
// else: the amount is the fee the server copied onto it. A retry with the same Idempotency-Key
// returns the same order; a new key is a new attempt with a fresh order.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/payments/orders",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "payments",
    idempotent: true,
    body: createOrderBody,
    audit: { action: "payment.order", entity: "payment" },
    doc: { summary: "Create a payment order for a held appointment", tags: ["payments"] },
  },
  async ({ actor, body, request }) =>
    new Response(
      JSON.stringify(
        await getPayments().createOrder(actor, body, request.headers.get("idempotency-key") ?? ""),
      ),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ),
);
