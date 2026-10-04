import { createHmac } from "node:crypto";

// What Better Auth exposes over HTTP (P2-13). Better Auth ships about 45 endpoints; most are not
// ours to offer (change email, delete user, social linking, list sessions with tokens, ...).
// Default deny: a path that is not in ALLOWED_AUTH_PATHS answers 404 before Better Auth looks at
// it. Adding a method later (Google in P2-17, staff password reset in P2-16) means adding its
// paths here on purpose. A test lists every endpoint of the configured instance and fails when a
// new one appears that nobody has classified, for example after a Better Auth upgrade.

export const ALLOWED_AUTH_PATHS: ReadonlySet<string> = new Set([
  "/get-session", // who am I (the token is stripped from the answer, see stripTokens)
  "/sign-out", // revoke this session, clear the cookie
  "/sign-in/email", // staff password step (a second step always follows)
  "/two-factor/verify-totp", // staff second step
  "/two-factor/verify-backup-code", // staff second step with a backup code
  "/phone-number/send-otp", // patient: also passes the OTP guard
  "/phone-number/verify", // patient: also passes the OTP guard
  "/update-user", // the patient's display name only, see UPDATE_USER_FIELDS
  "/change-password", // staff, signed in; ends every other session
  "/request-password-reset", // staff: emailed link, same answer for every address (P2-16)
  "/reset-password", // staff: the link's token plus the new password (P2-16)
]);

/**
 * Endpoints opened only by a configured method, never by default (Google, P2-17). They are
 * classified here so the inventory test knows them; `extraAllowedPaths` opens them.
 */
export const OPTIONAL_AUTH_PATHS: Readonly<Record<string, string>> = {
  "/sign-in/social": "starts a Google sign-in (only when Google is configured)",
  "/callback/:id": "Google's answer; only /callback/google is opened",
  "/link-social": "adds Google to a signed-in account (only when Google is configured)",
};

/** Endpoints that exist in Better Auth and are deliberately closed, with the reason. */
export const CLOSED_AUTH_PATHS: Readonly<Record<string, string>> = {
  "/ok": "no need; our own /api/health exists",
  "/error": "an HTML error page we do not use",
  "/account-info": "social provider details",
  "/list-accounts": "linked accounts are managed by our own screens (P2-17, P2-18)",
  "/list-sessions": "returns session tokens; /api/v1/sessions replaces it",
  "/revoke-session": "/api/v1/sessions/:id replaces it",
  "/revoke-sessions": "/api/v1/sessions replaces it",
  "/revoke-other-sessions": "/api/v1/sessions?scope=others replaces it",
  "/update-session": "sessions are fixed; nothing about them is client editable",
  "/verify-password": "an oracle for password guessing outside the sign-in limits",
  "/change-email": "staff email changes go through an admin (audited)",
  "/send-verification-email": "emails are verified by the invitation",
  "/verify-email": "emails are verified by the invitation",
  "/delete-user": "account deletion is a data request (P2-11)",
  "/delete-user/callback": "account deletion is a data request (P2-11)",
  "/reset-password/:token":
    "our emailed link goes straight to our own page, not through Better Auth redirect",
  "/phone-number/request-password-reset": "patients have no password",
  "/phone-number/reset-password": "patients have no password",
  "/sign-in/phone-number": "patients have no password",
  "/sign-up/email": "accounts are made by invitation or by phone verification only",
  "/unlink-account": "P2-17 and P2-18",
  "/get-access-token": "we never call a provider on the person's behalf",
  "/refresh-token": "same",
  "/two-factor/enable": "enrolment happens inside the invitation (P2-06)",
  "/two-factor/disable": "staff cannot switch two-factor off",
  "/two-factor/send-otp": "the emailed code method is not used",
  "/two-factor/verify-otp": "the emailed code method is not used",
  "/two-factor/get-totp-uri": "the secret is shown once, at enrolment",
  "/two-factor/generate-backup-codes": "regeneration gets its own audited screen later",
};

export function isAllowedAuthPath(
  path: string,
  extra: ReadonlySet<string> = new Set(),
  params?: Record<string, unknown>,
): boolean {
  // The provider callback is one route for every provider; Better Auth reports it as
  // "/callback/:id". Only the providers named in `extra` ("/callback/<id>") get through.
  if (path === "/callback/:id") return extra.has(`/callback/${String(params?.id ?? "")}`);
  return ALLOWED_AUTH_PATHS.has(path) || extra.has(path);
}

/** The only fields a person may change on their own record through /update-user. */
export const UPDATE_USER_FIELDS: ReadonlySet<string> = new Set(["name"]);

/**
 * Removes session tokens from a response body. Better Auth puts the token in the JSON of
 * sign-in and get-session as well as in the HttpOnly cookie; a script on the page (XSS) could
 * read it from the JSON and the cookie's HttpOnly flag would protect nothing. The browser never
 * needs the token: the cookie travels by itself.
 */
export function stripTokens<T>(body: T): T {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const copy: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  let changed = false;
  if ("token" in copy) {
    delete copy.token;
    changed = true;
  }
  const session = copy.session;
  if (session && typeof session === "object" && "token" in session) {
    const { token: _token, ...rest } = session as Record<string, unknown>;
    void _token;
    copy.session = rest;
    changed = true;
  }
  return (changed ? copy : body) as T;
}

/**
 * Keyed hash for the identifiers Better Auth stores in auth_verifications (phone numbers,
 * challenge ids). With the key, a leaked table does not list which numbers asked for a code.
 */
export function hashIdentifier(secret: string): (identifier: string) => Promise<string> {
  return async (identifier) =>
    createHmac("sha256", `identifier:${secret}`).update(identifier).digest("hex");
}
