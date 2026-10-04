import { z } from "zod";
import { withApi } from "@/lib/api/with-api";
import { INVITABLE_ROLES, getInvitations } from "@/modules/identity";

// Admin: invite a doctor, admin or support person by email (P2-06). An admin may invite doctors
// and support staff; only a super admin may invite an admin. The link is emailed, never returned.

const body = z
  .object({
    email: z.string().min(3).max(254),
    role: z.enum(INVITABLE_ROLES as [string, ...string[]]),
  })
  .strict();

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/admin/invitations",
    auth: "staff",
    roles: ["admin", "super_admin"],
    roleDenied: "not_found",
    rateLimit: "admin",
    body,
    audit: { action: "invitation.create", entity: "invitation" },
    doc: { summary: "Invite a staff member by email", tags: ["identity", "admin"] },
  },
  async ({ actor, body: input }) => {
    const created = await getInvitations().create({
      email: input.email,
      role: input.role as (typeof INVITABLE_ROLES)[number],
      invitedBy: actor.userId,
      inviterRoles: actor.roles,
    });
    return new Response(JSON.stringify(created), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  },
);
