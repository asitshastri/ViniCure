import { withApi } from "@/lib/api/with-api";
import { adminDoctorsQuery, getDirectory } from "@/modules/directory";

// Admin: the application queue, oldest first, with a cursor (P4-02).

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/admin/doctors",
    auth: "staff",
    roles: ["admin", "super_admin"],
    roleDenied: "not_found",
    rateLimit: "admin",
    query: adminDoctorsQuery,
    doc: { summary: "List doctor applications", tags: ["directory", "admin"] },
  },
  async ({ actor, query }) => getDirectory().list(actor, query),
);
