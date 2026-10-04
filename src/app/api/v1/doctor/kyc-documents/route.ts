import { withApi } from "@/lib/api/with-api";
import { getDirectory, uploadSlotBody } from "@/modules/directory";

// Step one of a KYC upload: the doctor asks for an upload slot (P4-02). The file then goes
// straight to storage; the server never handles its bytes.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/doctor/kyc-documents",
    auth: "staff",
    roles: ["doctor"],
    roleDenied: "not_found",
    rateLimit: "write",
    body: uploadSlotBody,
    audit: { action: "kyc.upload_start", entity: "kyc_document" },
    doc: { summary: "Get a presigned upload slot for a KYC document", tags: ["directory"] },
  },
  async ({ actor, body }) =>
    new Response(JSON.stringify(await getDirectory().requestUpload(actor, body)), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
);
