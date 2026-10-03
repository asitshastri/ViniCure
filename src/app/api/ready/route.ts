import { z } from "zod";
import { withApi } from "@/lib/api/with-api";
import { runReadinessChecks } from "@/lib/health/checks";

// Readiness: dependencies answer. Read-only. Reports ok or fail per name, no error text.
export const GET = withApi(
  {
    method: "GET",
    path: "/api/ready",
    auth: "public",
    rateLimit: "public_read",
    doc: {
      summary: "Readiness check",
      tags: ["platform"],
      response: z.object({
        status: z.enum(["ready", "not_ready"]),
        checks: z.record(z.string(), z.enum(["ok", "fail"])),
      }),
    },
  },
  async () => {
    const report = await runReadinessChecks();
    return new Response(
      JSON.stringify({ status: report.ready ? "ready" : "not_ready", checks: report.checks }),
      {
        status: report.ready ? 200 : 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  },
);
