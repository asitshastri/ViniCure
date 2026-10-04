import { withApi } from "@/lib/api/with-api";
import { getEngagement, idParams, reviewBody } from "@/modules/engagement";

// A patient reviews a completed consultation, once. It is public only after an admin publishes it.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/appointments/:id/review",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    params: idParams,
    body: reviewBody,
    audit: { action: "review.create", entity: "review" },
    doc: { summary: "Review a completed consultation", tags: ["engagement"] },
  },
  async ({ actor, params, body }) =>
    new Response(JSON.stringify(await getEngagement().submitReview(actor, params.id, body)), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
);
