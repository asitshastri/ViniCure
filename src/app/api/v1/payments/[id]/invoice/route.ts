import { withApi } from "@/lib/api/with-api";
import { getInvoices, paymentIdParams } from "@/modules/payments";

// The invoice for a payment (P5-08): a short-lived download link once the worker has drawn it,
// or "preparing" until then. Only the account that paid (404 for anyone else).

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/payments/:id/invoice",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "payments",
    params: paymentIdParams,
    audit: { action: "invoice.link", entity: "payment" },
    doc: { summary: "Get a download link for a payment's invoice", tags: ["payments"] },
  },
  async ({ actor, params }) => getInvoices().linkFor(actor, params.id),
);
