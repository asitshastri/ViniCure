import { withApi } from "@/lib/api/with-api";
import { idParams } from "@/modules/directory";
import { getSlots, slotsQuery } from "@/modules/scheduling";

// Public: the free slots of one listed doctor (P4-04). Kept in shared caches for a few seconds
// only, because booking changes the answer; the database constraint, not this list, prevents
// double booking.

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/doctors/:id/slots",
    auth: "public",
    rateLimit: "public_read",
    params: idParams,
    query: slotsQuery,
    doc: { summary: "List the free slots of a listed doctor", tags: ["scheduling"] },
  },
  async ({ params, query }) =>
    new Response(JSON.stringify(await getSlots().list(params.id, query)), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=10, s-maxage=10, stale-while-revalidate=20",
      },
    }),
);
