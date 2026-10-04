import { withApi } from "@/lib/api/with-api";
import { getAvailability, idParams } from "@/modules/scheduling";

export const DELETE = withApi(
  {
    method: "DELETE",
    path: "/api/v1/doctor/time-off/:id",
    auth: "staff",
    roles: ["doctor"],
    roleDenied: "not_found",
    rateLimit: "write",
    params: idParams,
    audit: { action: "time_off.remove", entity: "doctor" },
    doc: { summary: "Remove a block of time off", tags: ["scheduling"] },
  },
  async ({ actor, params }) => {
    await getAvailability().removeTimeOff(actor, params.id);
    return null;
  },
);
