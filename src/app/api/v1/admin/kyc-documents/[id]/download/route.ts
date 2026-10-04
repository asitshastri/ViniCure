import { withApi } from "@/lib/api/with-api";
import { getDirectory, idParams } from "@/modules/directory";

// Admin: a short-lived link to open one clean KYC document. Logged, because the file shows
// a doctor's identity papers.

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/admin/kyc-documents/:id/download",
    auth: "staff",
    roles: ["admin", "super_admin"],
    roleDenied: "not_found",
    rateLimit: "admin",
    freshLogin: true,
    params: idParams,
    audit: { action: "kyc.download", entity: "kyc_document" },
    doc: { summary: "Get a short-lived link to a KYC document", tags: ["directory", "admin"] },
  },
  async ({ actor, params }) => getDirectory().downloadUrl(actor, params.id),
);
