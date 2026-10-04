import { withApi } from "@/lib/api/with-api";
import { applicationBody, getDirectory } from "@/modules/directory";

// The signed-in doctor's own application (P4-02). A doctor reaches only their own row.

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/doctor/application",
    auth: "staff",
    roles: ["doctor"],
    roleDenied: "not_found",
    rateLimit: "auth_read",
    doc: { summary: "Read my doctor application and its documents", tags: ["directory"] },
  },
  async ({ actor }) => getDirectory().myApplication(actor),
);

export const PUT = withApi(
  {
    method: "PUT",
    path: "/api/v1/doctor/application",
    auth: "staff",
    roles: ["doctor"],
    roleDenied: "not_found",
    rateLimit: "write",
    body: applicationBody,
    audit: { action: "doctor.apply", entity: "doctor" },
    doc: { summary: "Create or change my doctor application", tags: ["directory"] },
  },
  async ({ actor, body }) => getDirectory().saveApplication(actor, body),
);
