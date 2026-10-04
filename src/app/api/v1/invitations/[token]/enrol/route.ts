import { z } from "zod";
import { withApi } from "@/lib/api/with-api";
import { getInvitations } from "@/modules/identity";

// Public (the link is the credential): step 1 of accepting an invitation. Returns the address
// for the authenticator app and the backup codes, once. Uses the otp_verify tier: it is a
// guessable-secret endpoint and must fail closed if the cache is down.

const params = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/) }).strict();

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/invitations/:token/enrol",
    auth: "public",
    rateLimit: "otp_verify",
    params,
    doc: {
      summary: "Start enrolment of the authenticator app for an invitation",
      tags: ["identity"],
    },
  },
  async ({ params: { token } }) => getInvitations().enrol(token),
);
