import type { BetterAuthOptions } from "better-auth";

// Google sign-in for patients (P2-17), through Better Auth's Google provider (OpenID Connect,
// authorization code flow, code exchanged server to server with Google).
//
// Rules, each proven by a test in google.test.ts:
//   - the account is identified by Google's `sub` (stored as the account id), never by email
//   - Google never joins an existing account on its own: a Google sign-in whose email belongs to
//     another account is refused (account_not_linked), whether that account is a patient or staff
//   - linking Google to an account needs that account's signed-in session, a sign-in within the
//     last 15 minutes, and a successful Google sign-in (which proves the Google side)
//   - staff can neither sign in with Google nor link it
//   - no Google tokens are kept: we never call Google again after the sign-in
//   - the browser cannot hand us an ID token to trust (`disableIdTokenSignIn`): only the code
//     exchange we start counts

/** The Better Auth paths this method opens. They exist only while Google is configured. */
export const GOOGLE_AUTH_PATHS: ReadonlySet<string> = new Set([
  "/sign-in/social",
  "/callback/google",
  "/link-social",
]);

export type GoogleCredentials = { clientId: string; clientSecret: string };

export function googleProviders(
  credentials: GoogleCredentials | undefined,
): NonNullable<BetterAuthOptions["socialProviders"]> {
  if (!credentials) return {};
  return {
    google: {
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      // Only the identity scopes: no Gmail, no Drive, no profile extras.
      scope: ["openid", "email", "profile"],
      accessType: "online",
      // Always show the account chooser, so a shared computer does not sign in silently.
      prompt: "select_account",
      disableIdTokenSignIn: true,
      overrideUserInfoOnSignIn: false,
    },
  };
}
