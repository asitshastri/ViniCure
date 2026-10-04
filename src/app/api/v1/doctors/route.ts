import { withApi } from "@/lib/api/with-api";
import { getDirectory, publicDoctorsQuery } from "@/modules/directory";

// Public: search the doctors who are approved and active (P4-03). Filters and sort orders are
// an allow-list; the page link is a cursor.

// Shared caches may keep this for a short time: it holds nothing personal and changes slowly.
const CACHE = "public, max-age=60, s-maxage=60, stale-while-revalidate=120";

const cached = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": CACHE },
  });

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/doctors",
    auth: "public",
    rateLimit: "public_read",
    query: publicDoctorsQuery,
    doc: {
      summary: "Search listed doctors by name, specialty, language, fee and availability today",
      tags: ["directory"],
    },
  },
  async ({ query }) => cached(await getDirectory().searchDoctors(query)),
);
