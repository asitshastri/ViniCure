import { withApi } from "@/lib/api/with-api";
import { createDataRequestBody, getDataRequests } from "@/modules/compliance";

// A patient asks for an export of their data or for their account to be deleted (P2-11). The
// request is recorded and audited; people process it later (P9). Needs a recent sign-in.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/data-requests",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    freshLogin: true,
    body: createDataRequestBody,
    audit: { action: "data_request.create", entity: "data_request" },
    doc: { summary: "Ask for a data export or for account deletion", tags: ["compliance"] },
  },
  async ({ actor, body }) =>
    new Response(JSON.stringify(await getDataRequests().create(actor.userId, body.type)), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
);

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/data-requests",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "auth_read",
    doc: { summary: "List your data requests and their status", tags: ["compliance"] },
  },
  async ({ actor }) => ({ items: await getDataRequests().list(actor.userId) }),
);
