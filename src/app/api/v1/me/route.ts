import { withApi } from "@/lib/api/with-api";

// Who am I? The signed-in person's id and roles, so the sign-in screens know where to go next
// (P2-12). Any role may call it; it only ever describes the caller.

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/me",
    auth: "session",
    rateLimit: "auth_read",
    doc: { summary: "The signed-in person's id and roles", tags: ["identity"] },
  },
  ({ actor }) => ({ id: actor.userId, roles: [...actor.roles], limited: actor.limited === true }),
);
