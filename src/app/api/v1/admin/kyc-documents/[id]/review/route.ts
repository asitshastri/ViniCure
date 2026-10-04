import { withApi } from "@/lib/api/with-api";
import { getDirectory, idParams, reviewDocumentBody } from "@/modules/directory";

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/admin/kyc-documents/:id/review",
    auth: "staff",
    roles: ["admin", "super_admin"],
    roleDenied: "not_found",
    rateLimit: "admin",
    freshLogin: true,
    params: idParams,
    body: reviewDocumentBody,
    audit: { action: "kyc.review", entity: "kyc_document" },
    doc: { summary: "Accept or refuse one KYC document", tags: ["directory", "admin"] },
  },
  async ({ actor, params, body }) => getDirectory().reviewDocument(actor, params.id, body),
);
