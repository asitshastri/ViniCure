import { withApi } from "@/lib/api/with-api";
import { getDirectory, idParams } from "@/modules/directory";

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/admin/doctors/:id",
    auth: "staff",
    roles: ["admin", "super_admin"],
    roleDenied: "not_found",
    rateLimit: "admin",
    params: idParams,
    doc: {
      summary: "Read one doctor application with its documents",
      tags: ["directory", "admin"],
    },
  },
  async ({ actor, params }) => getDirectory().detail(actor, params.id),
);
