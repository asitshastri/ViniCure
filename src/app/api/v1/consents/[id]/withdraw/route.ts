import { withApi } from "@/lib/api/with-api";
import { consentIdParams, getConsent } from "@/modules/consent";

// A person takes back an agreement they gave (P6-05; the full consent screens are P9-02). Only
// the person who gave it (404 for anyone else). Their video visits are closed until they agree
// again.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/consents/:id/withdraw",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    params: consentIdParams,
    audit: { action: "consent.withdraw", entity: "consent" },
    doc: { summary: "Withdraw an agreement", tags: ["consent"] },
  },
  async ({ actor, params }) => getConsent().withdraw(actor, params.id),
);
