import { withApi } from "@/lib/api/with-api";
import { getEngagement, moderationQuery } from "@/modules/engagement";

// Admin: reviews waiting to be published (or already decided), oldest first.

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/admin/reviews",
    auth: "staff",
    roles: ["admin", "super_admin"],
    roleDenied: "not_found",
    rateLimit: "admin",
    query: moderationQuery,
    doc: { summary: "List reviews for moderation", tags: ["engagement", "admin"] },
  },
  async ({ actor, query }) => getEngagement().moderationQueue(actor, query),
);
