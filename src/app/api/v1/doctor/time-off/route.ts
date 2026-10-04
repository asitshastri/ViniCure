import { withApi } from "@/lib/api/with-api";
import { getAvailability, timeOffBody } from "@/modules/scheduling";

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/doctor/time-off",
    auth: "staff",
    roles: ["doctor"],
    roleDenied: "not_found",
    rateLimit: "write",
    body: timeOffBody,
    audit: { action: "time_off.add", entity: "doctor" },
    doc: { summary: "Block days when I cannot see patients", tags: ["scheduling"] },
  },
  async ({ actor, body }) =>
    new Response(JSON.stringify(await getAvailability().addTimeOff(actor, body)), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
);
