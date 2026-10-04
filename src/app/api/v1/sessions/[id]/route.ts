import { z } from "zod";
import { withApi } from "@/lib/api/with-api";
import { getSessions } from "@/modules/identity";

const params = z.strictObject({ id: z.uuid() });

export const DELETE = withApi(
  {
    method: "DELETE",
    path: "/api/v1/sessions/:id",
    auth: "session",
    rateLimit: "write",
    params,
    audit: { action: "session.revoke", entity: "session" },
    doc: { summary: "End one of your other sessions", tags: ["identity"] },
  },
  async ({ actor, params: { id } }) => {
    await getSessions().revoke(actor.userId, actor.sessionId, id);
    return null;
  },
);
