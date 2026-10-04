import { withApi } from "@/lib/api/with-api";
import { getDirectory, idParams } from "@/modules/directory";

// Step two: the upload is done. The server checks size and file type, then queues the virus
// scan. Safe to repeat.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/doctor/kyc-documents/:id/complete",
    auth: "staff",
    roles: ["doctor"],
    roleDenied: "not_found",
    rateLimit: "write",
    params: idParams,
    audit: { action: "kyc.upload_complete", entity: "kyc_document" },
    doc: { summary: "Finish a KYC upload and queue the virus scan", tags: ["directory"] },
  },
  async ({ actor, params }) => getDirectory().completeUpload(actor, params.id),
);
