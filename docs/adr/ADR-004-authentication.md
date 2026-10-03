# ADR-004: Authentication

Status: accepted, with the identity rules of D-019 (2026-10-04). Review again in P2-13.

## Decision

Better Auth, self-hosted, storing users and sessions in our Postgres, wrapped in `modules/identity`.

- **Patients:** phone OTP and Google sign-in (OpenID Connect), both attached to one account. Phone alone is a weak proof, because Indian operators reassign deactivated numbers after about 90 days. Risk-based step-up, recovery codes and number re-verification are described in `docs/backend-architecture.md` section 3.
- **Staff (doctor, admin, support):** email, password and mandatory TOTP with backup codes. Created by invitation. No Google, no phone-only sign-in.
- **Not collected:** Aadhaar and PAN. Any government identity goes through ABHA/ABDM in a later phase after legal review.

## Why not Google only

Google gives a verified email but not a verified phone, and we cannot prove that two-factor is on for a doctor's personal account. Patients also receive reminders and links on their phone. So Google is one method among several, never the only one.

## Why not a managed identity provider (Firebase Auth, Google Identity Platform)

It would remove code to maintain but moves sign-in data and recovery decisions to a third party and forces our step-up rules into its rule engine. The revisit condition stays: a security review finds gaps, or a managed provider becomes a requirement.

## Threat notes (to extend in P2-13)

| Threat | Control |
|---|---|
| Recycled phone number signs in to an old account | Step-up on new device, 90 days idle, 180 days since phone check, recent number change; limited session until a second method is proven |
| Link sent to a recycled number | Link opens one document only, needs date of birth, 24 hours, 5 opens, revocable, logged, patient notified |
| Account linking by matching email or phone | Forbidden. Linking needs a signed-in session plus proof of the new method |
| Staff sign in by phone | Blocked in code and tested |
| OTP cost abuse | Captcha, per-phone and per-IP limits, daily SMS cap |
| Stolen session | Revocable server sessions, fresh login for sensitive actions, device list |

## Not verified

- Better Auth's phone plugin may not support our risk rules directly. P2-03 and P2-18 confirm what is built on top of it.
- Where OTPs are stored (Valkey versus `auth_verifications`). Confirm in P2-03.
- Argon2id support. Confirm in P2-15.
