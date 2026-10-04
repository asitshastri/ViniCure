import { withApi } from "@/lib/api/with-api";
import { appointmentIdParams, getAppointments } from "@/modules/scheduling";

// One appointment: the patient's account, the assigned doctor, admins and support. Anyone else
// gets 404 (policy: appointment.read).

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/appointments/:id",
    auth: "session",
    roles: ["patient", "doctor", "admin", "super_admin", "support"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "auth_read",
    params: appointmentIdParams,
    doc: { summary: "Read one appointment", tags: ["scheduling"] },
  },
  async ({ actor, params }) => getAppointments().get(actor, params.id),
);
