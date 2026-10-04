import { withApi } from "@/lib/api/with-api";
import { getEngagement, idParams, moderateBody } from "@/modules/engagement";

// Admin: publish or hide a review, then the doctor's rating is recomputed.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/admin/reviews/:id/moderate",
    auth: "staff",
    roles: ["admin", "super_admin"],
    roleDenied: "not_found",
    rateLimit: "admin",
    params: idParams,
    body: moderateBody,
    audit: { action: "review.moderate", entity: "review" },
    doc: { summary: "Publish or hide a review", tags: ["engagement", "admin"] },
  },
  async ({ actor, params, body }) => getEngagement().moderate(actor, params.id, body.decision),
);
