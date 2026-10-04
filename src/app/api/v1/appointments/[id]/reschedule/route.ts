import { withApi } from "@/lib/api/with-api";
import { appointmentIdParams, getAppointments, rescheduleBody } from "@/modules/scheduling";

// Move a confirmed appointment to another free slot of the same doctor. Owner only.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/appointments/:id/reschedule",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    params: appointmentIdParams,
    body: rescheduleBody,
    audit: { action: "appointment.reschedule", entity: "appointment" },
    doc: { summary: "Move an appointment to another slot", tags: ["scheduling"] },
  },
  async ({ actor, params, body }) => getAppointments().reschedule(actor, params.id, body),
);
