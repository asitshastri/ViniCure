# ADR-004: Authentication

Status: accepted, with the identity rules of D-019 (2026-10-04). Reviewed in P2-13 (2026-10-04); the human reviews the "Accepted risks" and "Open items" below.

## Decision

Better Auth, self-hosted, storing users and sessions in our Postgres, wrapped in `modules/identity`.

- **Patients:** phone OTP and Google sign-in (OpenID Connect), both attached to one account. Phone alone is a weak proof, because Indian operators reassign deactivated numbers after about 90 days. Risk-based step-up, recovery codes and number re-verification are described in `docs/backend-architecture.md` section 3.
- **Staff (doctor, admin, support):** email, password and mandatory TOTP with backup codes. Created by invitation. No Google, no phone-only sign-in.
- **Not collected:** Aadhaar and PAN. Any government identity goes through ABHA/ABDM in a later phase after legal review.

## Why not Google only

Google gives a verified email but not a verified phone, and we cannot prove that two-factor is on for a doctor's personal account. Patients also receive reminders and links on their phone. So Google is one method among several, never the only one.

## Why not a managed identity provider (Firebase Auth, Google Identity Platform)

It would remove code to maintain but moves sign-in data and recovery decisions to a third party and forces our step-up rules into its rule engine. The revisit condition stays: a security review finds gaps, or a managed provider becomes a requirement.

## Review of the configuration (P2-13)

Better Auth 1.7.7 was walked against its source and our tests, not only its documentation. What is true now:

| Topic | Finding | Where it is enforced and tested |
|---|---|---|
| Surface | Better Auth ships 47 endpoints. We expose 9 and answer 404 to the rest (default deny). A test lists every endpoint of the configured instance and fails when a new one is unclassified, for example after an upgrade | `surface.ts`, `surface.test.ts` |
| Tokens | Sign-in and get-session put the session token in the JSON as well as the HttpOnly cookie, so a script on the page could read it. Tokens are stripped from every answer | `stripTokens`, tested |
| Cookies | `__Host-vc_session`, HttpOnly, Secure, SameSite=Lax, Path=/, no Domain. Better Auth added a `__Secure-` prefix in front of ours until told otherwise | `auth.test.ts`, Playwright |
| Origin and CSRF | Better Auth checks Origin only on requests that carry cookies, so a cookie-less foreign POST to send-otp was accepted. A before-hook now refuses any foreign Origin; `withApi` and `proxy.ts` do the same for our own routes | `auth.test.ts`, `phone.test.ts`, `with-api.test.ts` |
| Sessions | Fixed lifetimes counted from sign-in (patient 14 days, staff 8 hours), no renewal, no cookie cache, so revoking works at once. Better Auth would renew by one global lifetime, which stretched staff sessions to 14 days | `auth.test.ts` |
| Session creation | One hook decides for every method: no session for a missing, locked or deleted account, none for staff without an enrolled authenticator. It reads the user through Better Auth's transaction-aware adapter, because sign-up creates the user and the session in one transaction | `staff.test.ts`, integration tests on real Postgres |
| TOTP replay | Better Auth accepts the same authenticator code again inside its window (found by the attack suite). A used code is refused for 2 minutes (RFC 6238 section 5.2) | `staff.ts`, `attacks.test.ts` |
| Two-factor | Password step alone returns "second step" and the interim session is deleted. `enable`, `disable`, emailed codes and `trustDevice` are closed, so staff cannot turn it off and the code is asked every time. Account lock-out after 5 wrong codes for 15 minutes | `staff.test.ts` |
| Phone | The plugin's password sign-in and phone password reset are closed. Staff cannot complete a phone sign-in. Codes: 6 digits, 5 minutes, 3 attempts, one use | `phone.test.ts`, `staff.test.ts` |
| Update user | Only `name` can change through `/update-user`; phone, email, image, status, role and two-factor are refused | `surface.test.ts` |
| Identifiers | Phone numbers and challenge ids in `auth_verifications` are stored as an HMAC keyed with `AUTH_SECRET` | `surface.test.ts`, Playwright |
| Backup codes | 10 codes, single use, stored encrypted with `AUTH_SECRET` in the plugin's format (reversible, because the plugin must read them) | `invitations.test.ts` |
| Password hashing | **Argon2id** (hash-wasm, OWASP minimum cost 19 MiB, 2 passes, 1 lane, 16 byte random salt, PHC string). Better Auth's default scrypt is not accepted: a stored hash that is not Argon2id never verifies, so there is no downgrade path. Staff password rules: 12 to 128 characters, not common, not repetitive, not containing the email name | `password.ts`, `password.test.ts` |
| Brute force on sign-in | 30 attempts per 15 minutes per address; 5 wrong passwords lock an account's password sign-in for 15 minutes, doubling on repeats within 24 hours (cap 24 hours); the same counting for emails without an account; a correct password clears the count; fail closed if the cache is down. The authenticator step has its own lock-out (5 wrong codes, 15 minutes) | `sign-in-guard.ts`, `sign-in-guard.test.ts`, Playwright |
| Password change | Ends every other session whatever the client asks; wrong current passwords are counted like wrong sign-ins; a reset (P2-16) also ends all sessions (`revokeSessionsOnPasswordReset`) | `staff.test.ts` |

## Threat notes

| Threat | Control |
|---|---|
| Recycled phone number signs in to an old account | Step-up on new device, 90 days idle, 180 days since phone check, recent number change; limited session until a second method is proven (P2-18, not built yet) |
| Link sent to a recycled number | Link opens one document only, needs date of birth, 24 hours, 5 opens, revocable, logged, patient notified (P7-12) |
| Account linking by matching email or phone | Forbidden. Linking needs a signed-in session plus proof of the new method (P2-17) |
| Staff sign in by phone | Blocked in code and tested (P2-05), including all four staff roles |
| Staff account without two-factor | Cannot get any session; enrolment is part of the invitation and the account only exists once the first code is proven (P2-06) |
| OTP cost abuse | Captcha, per-phone and per-IP limits, daily SMS cap with alert, fail closed (P2-04) |
| Cross-site request makes our server send SMS | Origin check on every state-changing request (Better Auth hook, `withApi`, `proxy.ts`) |
| Stolen session cookie | Revocable server sessions, device list, sign out everywhere, fresh login (15 minutes) for sensitive actions (P2-10) |
| XSS reads the session | HttpOnly cookie, no token in any JSON answer, nothing in localStorage (Playwright checks) |
| Guessing an invitation link | 32 random bytes, only the hash is stored, 72 hours, once, burnt after 5 wrong codes, one generic answer for every invalid case (P2-06) |
| Attacker reads the database | Phone identifiers hashed, backup codes and authenticator secrets encrypted; see Accepted risks for what is still readable |
| New Better Auth endpoint appears after an upgrade | Default deny plus the endpoint inventory test |
| IDOR on profiles, sessions, requests | Every query carries the owner id; the policy module returns 404; the access matrix test covers every route and role |

## Accepted risks (for the human to confirm)

1. **OTP codes sit in `auth_verifications.value` in clear text** for at most 5 minutes and 3 attempts. Better Auth compares the plain value. Hashing needs a custom `verifyOTP` that re-implements attempts and expiry; the exposure is a 5 minute window of codes that also need the matching phone number (which is hashed). Not worth the extra security-critical code now. Revisit if Better Auth adds hashed OTP storage.
2. **Session tokens are stored as written** (D-020). Someone who can read the `auth_sessions` table can use live sessions until they expire or are revoked. Better Auth has no option to store them hashed. Controls: the database is private, encrypted at rest, only the app role reads it, staff sessions last 8 hours. Revisit in P11 (hardening): a secondary store or a session table with hashed tokens.
3. **Backup codes are encrypted, not hashed**, with the application secret. Whoever has the database and `AUTH_SECRET` can read them; with only the database they cannot.
4. **A lock-out can be used to annoy a doctor**: anyone who knows a staff email can lock that account's password sign-in for 15 minutes by typing wrong passwords. This is the usual trade-off; the address limit and fail counts keep it from being cheap, and an admin can be told through the alert. Revisit with an unlock-by-email flow after P2-16.

## Open items

- P2-16: staff password reset (opens `/request-password-reset` and `/reset-password` with their own limits).
- P2-17 and P2-18: Google sign-in, account linking proof, step-up and recovery codes.
- Production needs the hCaptcha widget on the patient form (TODO DISCOVERED) before codes can be sent.

## Not verified

- Whether the MSG91 adapter's delivery delays make the 5 minute code life too short (P8).
- Argon2id cost against production hardware: 19 MiB and 2 passes take about 100 ms here; measure on the real task size in P3 and raise it if there is room.
