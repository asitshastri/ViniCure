import { withApi } from "@/lib/api/with-api";
import { getPatients, patientIdParams, updatePatientBody } from "@/modules/patients";

// One patient profile. Anyone but the owning account gets 404 (policy: patientProfile).

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/patients/:id",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "auth_read",
    params: patientIdParams,
    doc: { summary: "Read one patient profile", tags: ["identity"] },
  },
  async ({ actor, params }) => getPatients().get(actor, params.id),
);

export const PATCH = withApi(
  {
    method: "PATCH",
    path: "/api/v1/patients/:id",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    params: patientIdParams,
    body: updatePatientBody,
    audit: { action: "patient.update", entity: "patient" },
    doc: { summary: "Change a patient profile", tags: ["identity"] },
  },
  async ({ actor, params, body }) => getPatients().update(actor, params.id, body),
);

export const DELETE = withApi(
  {
    method: "DELETE",
    path: "/api/v1/patients/:id",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    params: patientIdParams,
    audit: { action: "patient.delete", entity: "patient" },
    doc: { summary: "Remove a family member's profile (soft delete)", tags: ["identity"] },
  },
  async ({ actor, params }) => {
    await getPatients().remove(actor, params.id);
    return null;
  },
);
