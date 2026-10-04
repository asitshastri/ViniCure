import { withApi } from "@/lib/api/with-api";
import { getDirectory, idParams } from "@/modules/directory";

// Public: one listed doctor, with the registration number and qualifications (P4-03).
// A doctor who is not listed is a 404 for everyone.

// Shared caches may keep this for a short time: it holds nothing personal and changes slowly.
const CACHE = "public, max-age=60, s-maxage=60, stale-while-revalidate=120";

const cached = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": CACHE },
  });

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/doctors/:id",
    auth: "public",
    rateLimit: "public_read",
    params: idParams,
    doc: { summary: "Read one listed doctor's public profile", tags: ["directory"] },
  },
  async ({ params }) => cached(await getDirectory().publicProfile(params.id)),
);
