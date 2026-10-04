import { withApi } from "@/lib/api/with-api";
import { getEngagement, idParams, pageQuery } from "@/modules/engagement";

// Public: the published reviews of a listed doctor, newest first. Reviewers are not named.

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/doctors/:id/reviews",
    auth: "public",
    rateLimit: "public_read",
    params: idParams,
    query: pageQuery,
    doc: { summary: "List the published reviews of a doctor", tags: ["engagement"] },
  },
  async ({ params, query }) =>
    new Response(JSON.stringify(await getEngagement().publicReviews(params.id, query)), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=120",
      },
    }),
);
