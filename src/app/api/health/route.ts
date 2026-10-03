import { withApi } from "@/lib/api/with-api";

// Liveness: the process is up. Touches no other service.
export const GET = withApi(
  { method: "GET", path: "/api/health", auth: "public", rateLimit: "public_read" },
  () => ({ status: "ok" }),
);
