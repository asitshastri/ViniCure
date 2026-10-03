import { withApi } from "@/lib/api/with-api";
import { getAuth } from "@/modules/identity";

// Better Auth's endpoints (sign-in, sign-out, session, and the methods added in P2-03 to P2-17).
// They go through withApi so every request gets a request ID, the rate limiter and the standard
// error shape. Better Auth reads the body itself, so no body schema is declared here.

export const GET = withApi(
  {
    method: "GET",
    path: "/api/auth/*",
    auth: "public",
    rateLimit: "public_read",
    doc: { summary: "Authentication endpoints (read)", tags: ["identity"] },
  },
  ({ request }) => getAuth().handler(request),
);

export const POST = withApi(
  {
    method: "POST",
    path: "/api/auth/*",
    auth: "public",
    rateLimit: "write",
    doc: {
      summary: "Authentication endpoints (sign-in, sign-out and similar)",
      tags: ["identity"],
    },
  },
  ({ request }) => getAuth().handler(request),
);
