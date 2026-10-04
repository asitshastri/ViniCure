import { withApi } from "@/lib/api/with-api";
import { favoriteBody, favoriteQuery, getEngagement } from "@/modules/engagement";

// A patient's saved doctors, per patient profile (their own only; anything else is 404).

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/favorites",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "auth_read",
    query: favoriteQuery,
    doc: { summary: "List the doctors saved for a patient profile", tags: ["engagement"] },
  },
  async ({ actor, query }) => getEngagement().listFavorites(actor, query.patientId),
);

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/favorites",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    body: favoriteBody,
    audit: { action: "favorite.add", entity: "doctor" },
    doc: { summary: "Save a doctor for a patient profile", tags: ["engagement"] },
  },
  async ({ actor, body }) =>
    new Response(JSON.stringify(await getEngagement().addFavorite(actor, body)), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
);

export const DELETE = withApi(
  {
    method: "DELETE",
    path: "/api/v1/favorites",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    body: favoriteBody,
    audit: { action: "favorite.remove", entity: "doctor" },
    doc: { summary: "Remove a saved doctor", tags: ["engagement"] },
  },
  async ({ actor, body }) => {
    await getEngagement().removeFavorite(actor, body);
    return null;
  },
);
