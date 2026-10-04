import { withApi } from "@/lib/api/with-api";
import { createPatientBody, getPatients } from "@/modules/patients";

// Family profiles of the signed-in patient account (P2-09).

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/patients",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "auth_read",
    doc: { summary: "List the patient profiles on this account", tags: ["identity"] },
  },
  async ({ actor }) => ({ items: await getPatients().list(actor) }),
);

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/patients",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    body: createPatientBody,
    audit: { action: "patient.create", entity: "patient" },
    doc: { summary: "Add a patient profile (self or family member)", tags: ["identity"] },
  },
  async ({ actor, body }) =>
    new Response(JSON.stringify(await getPatients().create(actor, body)), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
);
