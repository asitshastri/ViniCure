import { withApi } from "@/lib/api/with-api";
import { doctorDecisionBody, getDirectory, idParams } from "@/modules/directory";

// Admin: approve, reject, suspend or reinstate a doctor (P4-02). Needs a recent sign-in.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/admin/doctors/:id/decision",
    auth: "staff",
    roles: ["admin", "super_admin"],
    roleDenied: "not_found",
    rateLimit: "admin",
    freshLogin: true,
    params: idParams,
    body: doctorDecisionBody,
    audit: { action: "doctor.decide", entity: "doctor" },
    doc: {
      summary: "Approve, reject, suspend or reinstate a doctor",
      tags: ["directory", "admin"],
    },
  },
  async ({ actor, params, body }) => getDirectory().decide(actor, params.id, body),
);
