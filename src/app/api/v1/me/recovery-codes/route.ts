import { withApi } from "@/lib/api/with-api";
import { getStepUp, unusedRecoveryCodes } from "@/modules/identity";

// Recovery codes (P2-18, D-019): ten single-use codes, shown once, stored as hashes. Making a new
// set ends the old unused ones. Needs a full session and a sign-in in the last 15 minutes: a
// recycled number must not be able to make its own codes.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/me/recovery-codes",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    rateLimit: "write",
    freshLogin: true,
    fullSession: true,
    audit: { action: "recovery_codes.generate", entity: "recovery_codes" },
    doc: { summary: "Make a new set of ten recovery codes (shown once)", tags: ["identity"] },
  },
  async ({ actor }) =>
    new Response(JSON.stringify({ codes: await getStepUp().generateRecoveryCodes(actor.userId) }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
);

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/me/recovery-codes",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    rateLimit: "auth_read",
    fullSession: true,
    doc: { summary: "How many recovery codes are still unused", tags: ["identity"] },
  },
  async ({ actor }) => ({ remaining: await unusedRecoveryCodes(actor.userId) }),
);
