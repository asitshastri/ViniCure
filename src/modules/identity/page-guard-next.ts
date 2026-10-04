import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Role } from "../../lib/api/types";
import { getConfig } from "../../lib/config/config";
import { actorFromHeaders } from "./index";
import { guardOutcome } from "./page-guard";

/**
 * Call at the top of a layout behind sign-in. Redirects to /login without a session and shows
 * 404 to a signed-in person of the wrong role. Throws (a Next.js control-flow error) to stop
 * rendering, so nothing below it runs.
 */
export async function requireRole(
  allowed: readonly Role[],
): Promise<{ displayName: string | null; limited: boolean }> {
  const config = getConfig();
  const mock = config.UI_MOCK_SESSION && config.NODE_ENV !== "production";
  const actor = mock ? null : await actorFromHeaders(await headers());
  const outcome = guardOutcome(actor ? actor.roles : null, allowed, mock);
  if (outcome === "login") redirect("/login");
  if (outcome === "not_found") notFound();
  // The name on the account, so the shell greets the real person (null in the mock preview).
  return { displayName: actor?.displayName ?? null, limited: actor?.limited === true };
}
