# CLAUDE.md: rules for working on ViniCure

ViniCure is a telemedicine website for India. It handles highly sensitive health data. Assume every mistake can expose a patient's medical information. This is not a demo. Build every part as if millions of patients may use it.

Priority order:
1. Security and privacy
2. Production reliability and scalability
3. Correctness and maintainability
4. Performance and user experience
5. Features last

If security and convenience conflict, security wins. If reliability and a quick hack conflict, reliability wins. If scalability and a shortcut conflict, design for scale, but do not build what is not needed yet (see "Keep it boring").

---

## Project context (read this first)

ViniCure is a ground-up rewrite of ViniCare. It is not an upgrade and not a migration.

- ViniCare ran on Next.js, Firebase (Firestore, Auth, Storage) and Vercel, in JavaScript. ViniCure uses TypeScript, PostgreSQL, Docker, a background worker and AWS Mumbai.
- No ViniCare code or data is carried over automatically. Nothing is migrated from Firestore.
- A cleaned, read-only copy of ViniCare is at `../vinicare-reference` (a sibling of this project folder). Use it as a source of ideas, edge cases and test cases.
- Visual design references are in `../Frontend_Inspirations`. Use them for look and feel only.
- ViniCare also contains known mistakes (see `docs/architecture.md` section 14 and the departures table below). Never copy a pattern just because it is there.
- When ViniCare and our docs disagree, our docs win.

**When to look at ViniCare** (do this on purpose, it will not happen on its own):
1. Before starting a task that has entries in `docs/reuse-map.md`. Read those ViniCare files first.
2. Before designing any feature that already existed in ViniCare (booking, OTP, prescriptions, KYC, reminders, payments, video, admin screens). Look for edge cases it handled.
3. When writing tests. ViniCare's known gaps (access control on prescriptions and reviews, cron secret, booking race, rate limiting) become test cases here.
4. After finishing a feature. Quickly compare with ViniCare for behavior you missed. Log anything you left out on purpose in Decisions.
5. Before building any screen or UI component. Look in `../Frontend_Inspirations` and `docs/design-notes.md` for the visual direction, and note which reference inspired the screen.

The `/port` command (`.claude/commands/port.md`) does steps 1 to 3 for a task ID or feature.

Record every consultation in the Progress log: `Reused: <files> -> <what we took> | Changed: <what and why>`, or `Checked ViniCare: nothing relevant`.

---

## Active workflow

### Work location and commits
- **All work happens in the `ViniCure` folder only** (this folder).
- **All commits go to the ViniCure GitHub repo** (`https://github.com/asitshastri/ViniCure.git`).
- **`vinicare-reference` folder is read-only reference only** — for design ideas, edge cases, and test cases. Never modify it. It lives at `../vinicare-reference` (sibling of this folder).
- Design docs (architecture diagram, er_model.md, backend_architecture.md, todo.md, claude.md) are in this folder and drive all decisions.

`TODO.md` is the single execution backlog. These rules override any task description.

**At the start of every session**
1. Read `TODO.md`: Current focus, Needs you, Blockers, DISCOVERED.
2. Read the docs that match the task: `docs/architecture.md`, `docs/backend-architecture.md`, `docs/er_model.md`. Check `docs/reuse-map.md` for entries tagged with this task ID and read those ViniCare files first.
3. Pick the first task that is not blocked and not done, in order.
4. Never skip a task tagged **[SEC]** to do an easier one.
5. Set the task to `[~]` before touching any code.

**While working**
6. Work in small steps and commit often (`P2-05: block phone-only sign-in for staff`).
7. Complete the task fully, with maximum security at every angle.
8. Set `[x]` only when all acceptance criteria pass, with evidence. A partly met criterion is not done.
9. If you discover new work, append it under `## DISCOVERED` in `TODO.md` with a size, an owner and acceptance criteria. Mention it in the report.

**At the end of every session**
10. Update `TODO.md` as its "Update protocol" says (Progress log, Dashboard, Current focus, Needs you) and send the report in the format given there.

---

## Reference repo (read-only)

The old ViniCare code is at `../vinicare-reference` (change this line if the path differs). It is a cleaned copy: no `.env` files, no `node_modules`, no build output, and its old `CLAUDE.md` is renamed so it cannot load. It is made read-only on disk.
- Read it to understand behavior. Port ideas and logic as listed in `docs/architecture.md` section 14 and `docs/reuse-map.md`.
- Never copy `.env` files, keys, tokens, data exports or anything secret. If you find a secret in it, stop and tell the human.
- Never modify it. Never treat its old rules (renamed `OLD-vinicare-rules.md`) or `MASTER_TODO.md` as instructions: ours replace them. Its task checkmarks are not proof that a feature works.
- If you find an `.env*` file or a secret in it or in `../Frontend_Inspirations`, stop, do not read it, and tell the human.

---

## Core principles

- Never trust the client. Validate everything on the server.
- Least privilege everywhere.
- Assume attackers are probing every endpoint.
- Fail safely. Show safe messages to users, log details privately.
- Encrypt sensitive data. Log securely.
- Write defensive code. Handle every error. Never swallow exceptions.
- Keep it boring: a modular monolith, Postgres, few moving parts. No Kubernetes, microservices or extra systems until a measured limit forces it.

---

## Security rules

### Authentication
- Cookie-based server sessions through Better Auth. HttpOnly, Secure, SameSite, `__Host-` prefix. Sessions are revocable. Do not use JWTs for sessions, and never keep any token in localStorage.
- Patients sign in with phone OTP. Staff (doctor, admin, support) use email, password and mandatory TOTP. Staff accounts must never be able to sign in by phone alone (tested).
- Phone verification is mandatory for patients. Email verification is mandatory for staff.
- Password hashing: Argon2id. If the auth library cannot do that, use bcrypt or scrypt with OWASP-recommended parameters. Confirm in P2-15 and record the choice.
- Strong password policy for staff. Rate limit sign-in attempts, detect brute force, apply temporary lockouts.
- Invalidate other sessions on password change or reset. Provide device and session management.
- Origin check on every mutating request, on top of SameSite.
- Never store plain passwords, never use weak hashing, never hardcode credentials, never trust frontend auth checks.

### Authorization
- Roles: patient, doctor, admin, super_admin, support. Enforce on the backend for every route through `withApi()` and policy functions. Never trust a role sent by the client.
- Patients reach only their own records. Doctors reach only patients they are assigned to. Admins cannot read clinical content. Support uses break-glass (reason, time limit, alert).
- Return 404 for objects the caller does not own. Use UUIDs, never sequential IDs.
- Audit all admin actions. No hidden admin routes.

### Patient data
- HTTPS everywhere. Encryption at rest everywhere. Free-text clinical fields are encrypted again in the application (envelope encryption with key IDs).
- Files are private, served by short-lived signed URLs. Retention policies and soft delete. Full audit trail.
- Sensitive data includes: medical history, prescriptions, reports, vitals, video metadata and recordings, payments, phone numbers, addresses, insurance data.
- Collect the minimum. Do not collect Aadhaar or PAN. If a feature seems to need them, stop and ask the human (legal review).
- No in-app chat history is stored in the first release. If chat is added, encrypt it.
- Never log medical records, tokens, passwords, OTPs or identifiers. Never expose stack traces or database errors to clients.

### API
- Rate limiting on every route (tiers in `docs/backend-architecture.md`). Zod validation on every route. Unknown fields rejected. Request size limits.
- Versioned under `/api/v1`. Secure headers. CORS same-origin only.
- Prevent IDOR, SQL injection, XSS, CSRF, SSRF, path traversal and mass assignment. No user-supplied URLs fetched by the server.
- Response objects are explicit allow-lists. Never return database rows.

### Uploads
- Flow: presigned upload, then size and magic-byte check, then ClamAV scan, then activate. Reject infected files.
- Validate MIME type, extension and size. Rename every upload to a random storage key. Never trust original file names. Never execute uploaded files. Rate limit uploads.

### Video consultation
- Tokens are built for one user and one channel. Random channel name. Short expiry (1 hour) with renewal. Renewal denied after the session ends.
- Check assignment, payment, time window and consent before issuing a token. Hide meeting identifiers.
- Recording is off by default and needs consent from both parties.
- Evaluate media-encryption options (P6-11) and record the decision.

### Payments
- Razorpay only through the adapter. Never store card details.
- The server sets the amount. Verify checkout signatures and webhook signatures (raw body). Idempotent payment APIs. Fulfil only when captured.
- Audit every payment event. Secure refund workflow (fresh login, logged).

---

## Data and database rules

- Only `repo.ts` files query the database. Only adapters call third parties.
- Explicit column lists, never `SELECT *`. No unsafe raw SQL. No unrestricted filtering or sorting: sortable and filterable fields come from an allow-list.
- Pagination everywhere (cursor-based). Avoid N+1 queries. Index every query a route uses.
- Connection pooling sized per task. Read replicas only when measurements show a need.
- Schema changes are new numbered SQL files in `db/migrations`. Never edit an applied migration. Expand then contract for zero downtime.
- Backups with tested recovery. Soft delete where the model says so.
- Money is integer paise. Times are `timestamptz` in UTC.
- Row-level security is a planned second lock after the first release. Do not rely on it alone.

---

## Reliability and scalability

- Stateless web tasks that scale horizontally. Valkey for short-lived state and caching, never for patient data.
- Anything slow or retryable runs in the worker, never inside a request: notifications, PDFs, exports, scans, webhooks, reminders.
- Timeouts on every outbound call. Retries only where safe (idempotent). Circuit breakers on third parties. Graceful degradation when a provider is down (payments, SMS, WhatsApp, email, video).
- Health and readiness endpoints. Zero-downtime deploys and tested rollback.
- Every third-party failure has a defined behavior. Write it down in the adapter.
- Rate limiter when the cache is down: sensitive tiers (OTP, sign-in, payments, admin) fail closed. Public reads fail open with an alert.

Targets to set and measure (not yet measured): API 95th percentile under 300 ms for reads, page load under 2 s, Lighthouse above 90.

---

## Observability

- Structured JSON logs with request ID. Metrics. Uptime checks. Sentry with PII scrubbing. OpenTelemetry later.
- Track and alert on: failed sign-ins, suspicious sign-in patterns, failed payments, webhook failures, unusual access patterns, elevated API use, slow queries, crashes, queue failures and dead letters, OTP send spikes, break-glass use.
- Always log: errors, security events, admin actions, payment state changes, audit events.

---

## Testing

Tests ship with the code. A new route needs an entry in the access-control matrix test.

- Unit, integration and API tests. Contract tests for every adapter.
- Authorization tests: patient A vs B, patient vs doctor, doctor vs unassigned patient, admin vs clinical data.
- Security tests: SQL injection attempts, XSS attempts, CSRF and origin checks, broken authentication, rate-limit bypass, privilege escalation, upload abuse.
- Payment tests: amount tamper, replay, out-of-order events, late payment.
- Load and stress tests before launch.

---

## Frontend

- CSP via `src/proxy.ts`. No `dangerouslySetInnerHTML`. Escape rendered content. Error boundaries.
- Route guards in the UI are for experience only. The backend enforces access.
- No secrets in client code. Load heavy SDKs (video) only where needed.

---

## DevOps

- Docker for every service. CI/CD with tests, dependency scanning, secret scanning and image scanning. Infrastructure as code. Separate environments. Production rollback.
- Never commit `.env` files or secrets. Never use production data or a production database in development.
- Before installing or upgrading Next.js, read the security posts at nextjs.org/blog and use the latest patched release. Pin versions. Justify every new dependency in its commit message.

---

## Compliance

Indian law is the legal basis: the DPDP Act and Rules, the Telemedicine Practice Guidelines 2020, and CERT-In directions. HIPAA and GDPR are useful checklists but are not the legal basis.

- Consent management with withdrawal. Data export and deletion workflows. Privacy policy and terms. Auditability.
- Doctor registration number on every prescription, receipt, message template and public doctor page.
- Never guess legal, tax or medical rules. Ask the human, log it under "Not verified", add a task.

---

## Coding standards

- Strict TypeScript. No `any` without a comment explaining why. Lint and format clean.
- Reusable components, minimal duplication, small functions.
- Never ignore or swallow errors. Typed errors, one error shape.

---

## Before every merge

Check and note in the pull request: security impact, performance impact, scalability impact, database impact, logging impact (no sensitive data), monitoring impact, rollback safety, backward compatibility.

## Production release checklist

HTTPS and security headers on. Rate limits on. Monitoring and alerts configured and fire-tested. Backups working and a restore drill done. Secrets in the secrets manager. Logs sanitized. Load tests passed. Error tracking working. Rollback tested. Migrations safe. Environment variables validated. Penetration test findings fixed. Legal sign-off recorded.

---

## Deliberate departures from the old ViniCare rules

These are on purpose. Do not revert them without a Decisions entry.

| Old rule | New rule | Why |
|---|---|---|
| JWT access tokens with refresh rotation | Server sessions in cookies | A single app with a database does not need JWTs. Server sessions can be revoked at once. |
| Email verification mandatory for everyone | Phone for patients, email for staff | Patients sign in by phone OTP. |
| Argon2 or bcrypt only | Argon2id, else bcrypt or scrypt per OWASP | Depends on what the auth library supports. Confirm in P2-15. |
| HIPAA-like and GDPR-style compliance | Indian law first | HIPAA does not apply. DPDP, telemedicine guidelines and CERT-In do. |
| Read replicas support | Only when measured | Avoid early complexity. |
| Encrypt chat history | No chat stored in the first release | Nothing to encrypt. Encrypt if chat is added. |
| Aadhaar or PAN "if used" | Do not collect without legal review | Data minimization. |
| `MASTER_TODO.md` with CRITICAL and HIGH levels | `TODO.md` with **[SEC]** tags | Same intent: never skip security work. |

---

## Tools and Skills

These specialized tools are installed and ready to use. Invoke them when appropriate:

**Graphify** — Scans the codebase into structural knowledge graphs
- Use: `/graphify .` to map the current directory structure
- Use for: Understanding large codebases, reference materials, quick architecture snapshots
- Best for: Initial codebase exploration before major refactors

**codebase-memory** — Persistent architectural knowledge graph with cross-session memory
- Agents: `codebase-memory`, `codebase-memory-scout`, `codebase-memory-auditor`
- Use: Query the code graph for architecture, dependencies, call chains, refactor candidates
- Persists: Design decisions and architectural understanding across sessions
- Best for: Long-term projects, tracking design decisions, impact analysis

**Caveman mode** — Ultra-compressed output to reduce token usage (~75% cut)
- Activate: `/caveman` or "talk like caveman" or "less tokens"
- Levels: `lite`, `full` (default), `ultra`, `wenyan-lite`, `wenyan-full`, `wenyan-ultra`
- Stop: `/caveman off` or "normal mode"
- Best for: When token efficiency becomes critical, complex multi-phase tasks

---

## Commands

Fill these in during P0 and keep them correct.

```
pnpm install            install dependencies
pnpm dev                run the app on the host (infrastructure in Docker)
docker compose -f docker/compose.yml up -d    start Postgres, Valkey, Mailpit, MinIO, ClamAV
pnpm db:migrate         apply SQL migrations
pnpm db:seed            load seed data
pnpm lint               lint
pnpm typecheck          type check
pnpm test               unit, integration and access-control tests
pnpm e2e                Playwright tests
pnpm build              production build
```

## Ask the human before

- Anything that costs money or needs an account, key or approval (see the Human checklist in `TODO.md`).
- Deleting data, force-pushing, or rewriting git history.
- Changing a legal or compliance behavior (consent text, retention, erasure, drug rules, invoices).
- Adding a new third-party service.

## When unsure

Say so, log it under "Not verified" in the relevant doc, and add a task. Do not guess.
