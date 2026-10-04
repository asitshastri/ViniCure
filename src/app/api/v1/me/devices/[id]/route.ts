import { z } from "zod";
import { errors } from "@/lib/errors/app-error";
import { withApi } from "@/lib/api/with-api";
import { revokeTrustedDevice } from "@/modules/identity";

const params = z.strictObject({ id: z.uuid() });

export const DELETE = withApi(
  {
    method: "DELETE",
    path: "/api/v1/me/devices/:id",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    rateLimit: "write",
    fullSession: true,
    params,
    audit: { action: "device.revoke", entity: "device" },
    doc: { summary: "Forget a remembered device", tags: ["identity"] },
  },
  async ({ actor, params: { id } }) => {
    // Someone else's device is a 404, the same as one that does not exist.
    if (!(await revokeTrustedDevice(actor.userId, id))) throw errors.notFound();
    return null;
  },
);
