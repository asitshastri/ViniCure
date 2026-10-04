import { z } from "zod";
import { withApi } from "@/lib/api/with-api";
import { getInvitations } from "@/modules/identity";

// Public (the link is the credential): step 2. Sets the name and password, proves the first
// authenticator code, and creates the account. The person then signs in the usual way.

const params = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/) }).strict();
const body = z
  .object({
    name: z.string().min(2).max(100),
    password: z.string().min(1).max(256),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/invitations/:token/accept",
    auth: "public",
    rateLimit: "otp_verify",
    params,
    body,
    audit: { action: "invitation.accept", entity: "invitation" },
    doc: {
      summary: "Accept an invitation: set a password and confirm the authenticator",
      tags: ["identity"],
    },
  },
  async ({ params: { token }, body: input }) => {
    const { email } = await getInvitations().accept({ token, ...input });
    return { email };
  },
);
