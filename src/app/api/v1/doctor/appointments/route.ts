import { withApi } from "@/lib/api/with-api";
import { appointmentsQuery, getAppointments } from "@/modules/scheduling";

// A doctor's confirmed, upcoming appointments, soonest first, with a cursor.

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/doctor/appointments",
    auth: "staff",
    roles: ["doctor"],
    roleDenied: "not_found",
    rateLimit: "auth_read",
    query: appointmentsQuery,
    doc: { summary: "List my upcoming appointments as a doctor", tags: ["scheduling"] },
  },
  async ({ actor, query }) => getAppointments().list(actor, query),
);
