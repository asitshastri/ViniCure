import { withApi } from "@/lib/api/with-api";
import { getDirectory } from "@/modules/directory";

// Public: the specialties and how many listed doctors each has (P4-03).

// Shared caches may keep this for a short time: it holds nothing personal and changes slowly.
const CACHE = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

const cached = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": CACHE },
  });

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/specialties",
    auth: "public",
    rateLimit: "public_read",
    doc: { summary: "List specialties with the number of listed doctors", tags: ["directory"] },
  },
  async () => cached({ items: await getDirectory().specialties() }),
);
