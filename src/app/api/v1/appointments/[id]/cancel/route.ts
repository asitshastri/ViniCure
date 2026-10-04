import { withApi } from "@/lib/api/with-api";
import { appointmentIdParams, cancelBody, getAppointments } from "@/modules/scheduling";

// Cancel: the patient's account, the assigned doctor, or an admin (policy: appointment.cancel).
// The reason is one of a fixed list, never free text. Refund rules arrive with payments (P5).

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/appointments/:id/cancel",
    auth: "session",
    roles: ["patient", "doctor", "admin", "super_admin"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    params: appointmentIdParams,
    body: cancelBody,
    audit: { action: "appointment.cancel", entity: "appointment" },
    doc: { summary: "Cancel an appointment", tags: ["scheduling"] },
  },
  async ({ actor, params, body }) => getAppointments().cancel(actor, params.id, body),
);
