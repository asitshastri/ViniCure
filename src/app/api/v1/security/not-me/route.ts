import { z } from "zod";
import { errors } from "@/lib/errors/app-error";
import { withApi } from "@/lib/api/with-api";
import { getStepUp } from "@/modules/identity";

// The "this was not me" link from a new-device notice (P2-18, D-019 rule 6). The link token is the
// credential. It works once, ends every session, forgets every device and forces step-up on the
// next phone sign-in. Every invalid link gets the same answer.

const body = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/) });

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/security/not-me",
    auth: "public",
    rateLimit: "otp_verify",
    body,
    audit: { action: "security.not_me", entity: "session" },
    doc: { summary: "Report a sign-in that was not you (link from a notice)", tags: ["identity"] },
  },
  async ({ body: { token } }) => {
    if (!(await getStepUp().notMe(token))) {
      throw errors.notFound({ detail: "This link is not valid or was already used." });
    }
    return { done: true };
  },
);
