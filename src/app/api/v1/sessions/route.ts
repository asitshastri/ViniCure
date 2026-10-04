import { z } from "zod";
import { withApi } from "@/lib/api/with-api";
import { getConfig } from "@/lib/config/config";
import { expiredSessionCookie, getSessions } from "@/modules/identity";

// The signed-in person's own sessions (P2-10). Any role may use it, on their own sessions only.

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/sessions",
    auth: "session",
    rateLimit: "auth_read",
    doc: { summary: "List where you are signed in", tags: ["identity"] },
  },
  async ({ actor }) => ({ items: await getSessions().list(actor.userId, actor.sessionId) }),
);

const query = z.strictObject({ scope: z.enum(["all", "others"]).default("all") });

// scope=all (default) is "sign out everywhere": this session ends too and the cookie is cleared.
export const DELETE = withApi(
  {
    method: "DELETE",
    path: "/api/v1/sessions",
    auth: "session",
    rateLimit: "write",
    query,
    audit: { action: "session.revoke_all", entity: "session" },
    doc: {
      summary: "Sign out everywhere (or everywhere else with scope=others)",
      tags: ["identity"],
    },
  },
  async ({ actor, query: { scope } }) => {
    const revoked = await getSessions().revokeMany(actor.userId, actor.sessionId, scope);
    const headers = new Headers({ "Content-Type": "application/json" });
    if (scope === "all") {
      headers.append("Set-Cookie", expiredSessionCookie(getConfig().NODE_ENV === "production"));
    }
    return new Response(JSON.stringify({ revoked }), { status: 200, headers });
  },
);
