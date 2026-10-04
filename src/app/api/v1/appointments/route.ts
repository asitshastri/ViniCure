import { withApi } from "@/lib/api/with-api";
import { getAppointments, holdBody } from "@/modules/scheduling";

// A patient holds a slot (P4-05). Idempotent: a retry with the same key replays the answer.
// The fee is copied by the server; no amount is accepted from the client.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/appointments",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    idempotent: true,
    body: holdBody,
    audit: { action: "appointment.hold", entity: "appointment" },
    doc: { summary: "Hold a slot for a patient profile", tags: ["scheduling"] },
  },
  async ({ actor, body }) =>
    new Response(JSON.stringify(await getAppointments().hold(actor, body)), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
);
