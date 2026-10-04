import { withApi } from "@/lib/api/with-api";
import { getAvailability, hoursBody } from "@/modules/scheduling";

// A doctor's own weekly hours and upcoming time off (P4-08). Changes are for new bookings; nothing
// already booked is moved.

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/doctor/availability",
    auth: "staff",
    roles: ["doctor"],
    roleDenied: "not_found",
    rateLimit: "auth_read",
    doc: { summary: "Read my weekly hours and time off", tags: ["scheduling"] },
  },
  async ({ actor }) => getAvailability().get(actor),
);

export const PUT = withApi(
  {
    method: "PUT",
    path: "/api/v1/doctor/availability",
    auth: "staff",
    roles: ["doctor"],
    roleDenied: "not_found",
    rateLimit: "write",
    body: hoursBody,
    audit: { action: "availability.update", entity: "doctor" },
    doc: { summary: "Replace my weekly hours", tags: ["scheduling"] },
  },
  async ({ actor, body }) => getAvailability().saveHours(actor, body),
);
