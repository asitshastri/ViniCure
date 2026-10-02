# ViniCure TODO

Master task list. Claude Code reads this first and updates it after every task. The human reads the Dashboard, Current focus and Needs you sections.

Last updated: 2 October 2026 (planning baseline, no work started)

## How to use this file

**Status marks**

| Mark | Meaning |
|---|---|
| `[ ]` | To do |
| `[~]` | In progress (only one or two at a time) |
| `[x]` | Done, with evidence in the Progress log |
| `[!]` | Blocked, reason in Blockers |
| `[-]` | Dropped, reason in Decisions |

**Order:** work in phase order, first unblocked task first. Tasks tagged **[SEC]** are security-critical: never skip one to do an easier task, and never mark one done with partly met criteria. These rules override task descriptions.

**Size:** S (under half a day), M (up to about two days), L (longer). Rough guesses.
**Owner:** C = Claude Code, H = Human (needs your action), C+H = both.

**Update protocol for Claude Code (every task, no exceptions)**

1. Before starting: read `CLAUDE.md`, this file, and the docs the task points to. Set the task to `[~]` and update Current focus.
2. Do the work in small commits. Follow the rules in `CLAUDE.md`.
3. Prove the acceptance criteria (AC): run lint, typecheck and the relevant tests. Do not mark a task done without evidence.
4. After finishing: set the task to `[x]`, add one line to the Progress log (date, task ID, what changed, checks run, commit hash), update the Dashboard counts, and fix any doc that is now out of date.
5. If a task needs the human (accounts, keys, legal text, payments, DLT, domain), set it to `[!]`, add it under Needs you, and move on to the next task that is not blocked.
6. If you make a design decision or find that a doc is wrong, add a line to Decisions and update the doc in the same commit.
7. If you discover new work, append it under DISCOVERED with a size, owner and acceptance criteria, and mention it in the report.
8. End every working session with a report in the format below.

**Report format (send to the human at the end of each session)**

```
Update: <date>
Done: <task IDs and one line each>
In progress: <task IDs>
Needs you: <specific asks with what, why and deadline>
Next: <next 3 tasks>
Risks and decisions: <anything surprising>
Checks: lint <pass/fail>, types <pass/fail>, tests <n passed, n failed>
```

**Definition of done:** the acceptance criteria are shown to pass, tests exist for new behavior (access-control tests for any route), docs are updated, no secrets or patient data in code or logs, CI is green.

---

## Dashboard

| Phase | Name | Total | Done | In progress | Blocked |
|---|---|---|---|---|---|
| 0 | Bootstrap | 16 | 0 | 0 | 0 |
| F | Frontend (UI first, mock data) | 23 | 15 | 0 | 0 |
| 1 | Platform foundations | 21 | 0 | 0 | 0 |
| 2 | Identity and access | 16 | 0 | 0 | 0 |
| 3 | Cloud staging | 14 | 0 | 0 | 0 |
| 4 | Directory and scheduling | 10 | 0 | 0 | 0 |
| 5 | Payments | 11 | 0 | 0 | 0 |
| 6 | Video consultation | 11 | 0 | 0 | 0 |
| 7 | Clinical records | 11 | 0 | 0 | 0 |
| 8 | Notifications and jobs | 8 | 0 | 0 | 0 |
| 9 | Compliance and admin | 13 | 0 | 0 | 0 |
| 10 | Frontend polish | 6 | 0 | 0 | 0 |
| 11 | Hardening and launch | 10 | 0 | 0 | 0 |
| 12 | After launch | 8 | 0 | 0 | 0 |
| | **Total** | **178** | **15** | **0** | **0** |

## Current focus

Phase F (frontend, mock data), in order. F-01 to F-10 done (public site complete). Next F-16 (doctor consultation console). Decision D-007: the human asked for UI first. Backend phases (P1 to P9) follow and wire to these screens.

## Needs you

| Ask | Why | Needed by | Status |
|---|---|---|---|
| Start DLT registration with an SMS provider (principal entity, sender ID, templates) | Long lead time. Blocks OTP and reminders in production. | Start now, needed by P8 | Not started |
| Clean the reference copy: delete `node_modules`, `.next`, `.vercel`, move `.env*` out, rename old `CLAUDE.md`, set read-only (commands in the setup guide, task P0-15) | Lets Claude Code consult ViniCare without reading secrets | Before the first session | Not started |
| Start Meta business verification and WhatsApp number | Long lead time. | Start now, needed by P8 | Not started |
| Decide about the "agent rules" block `next dev` adds to `CLAUDE.md` (tell me keep or remove) | It rewrites a file you own each time the dev server runs. I left it uncommitted. | Any time | Not started |
| Supply the final logo as a real transparent PNG or SVG (the "no background" file has a checkerboard baked in) | The current logo is a temporary derived copy | Before launch | Not started |
| Give the GST and invoice rule and the cancellation and refund policy for consultations (placeholders are on the booking review step) | Booking and receipts cannot show final wording without it | Before P5 | Not started |
| Confirm medical record retention: the old ViniCare backlog assumed 7 years, one source we found says at least 3 years | Sets retention rules, the erasure job and the retention matrix | Before P9-04 | Not started |

## Blockers

None.

## DISCOVERED

New tasks found while working. Claude Code appends here, the human triages them into a phase.

| Date | Found during | Task | Size | Owner | Acceptance criteria | Triage |
|---|---|---|---|---|---|---|
| 2026-10-02 | F-04 | **[SEC]** Server-side route guard for `/patient/*`, `/doctor/*`, `/admin/*` and `/staff/*`. The Phase F layouts use a fake session and let anyone in. They must never be deployed like that. | S | C | Without a valid session of the right role, every panel route returns a redirect to sign-in or a 404, tested in the access-control matrix. Layouts read the real session. | Fold into P2-08 and P2-12. Block P3-14 (staging deploy) until done. |
| 2026-10-02 | F-04 | Sign out is a link to `/login` in the UI shell. It must become a POST that revokes the session and clears the cookie. | S | C | Sign out revokes the session server-side (tested). | Fold into P2-10. |
| 2026-10-02 | F-08 | **[SEC]** Booking and payment must require a real patient session, and the slot hold, price and double-booking check must be server-side and atomic. The Phase F page is public and trusts the browser. | M | C | `/book/*` redirects to sign-in without a patient session; two patients paying for one slot get one booking and one refund (tested); amount is never read from the request. | Fold into P4 (booking) and P5 (payments). |
| 2026-10-02 | F-08 | Tax and invoice wording, cancellation window (2 hours) and refund text on the review step are placeholders. Ask the human, log under Not verified. | S | H | Human supplies GST/invoice rule and the refund policy; text replaced and marked reviewed. | Needs you before P5. |
| 2026-10-02 | F-09 | Cookie consent banner and preference centre (the cookie policy says optional cookies stay off until the person agrees). Not built in Phase F because no optional cookies exist yet. | S | C | Banner appears only if optional cookies are added; choice is stored and can be changed from the footer. | Fold into P9. |
| 2026-10-02 | F-11 | **[SEC]** Cancel, reschedule and review must be enforced on the server: only the booking patient, only upcoming, free window and refund computed server-side, reviews only for completed visits by that patient. The UI flags (`freeChange`, `canJoin`) are display hints. | M | C | Another patient's appointment id returns 404 on cancel, reschedule and review (tested); a late cancel never refunds; a duplicate cancel is idempotent. | Fold into P4 (appointments) and the access-control matrix. |
| 2026-10-02 | F-12 | **[SEC]** The vault UI checks type and size in the browser only. The server must do presigned upload, magic-byte check, ClamAV scan, random storage keys, short-lived signed download links, share grants with expiry that doctors can read only while valid, and an access log entry per open. | L | C | Upload abuse tests (wrong MIME, renamed executable, oversize, EICAR) are rejected; a doctor without a valid share gets 404; every open is in the audit log. | Fold into P7 (records) and the access-control matrix. |
| 2026-10-02 | F-13 | **[SEC]** Profile, history, consent, session and erasure actions need server enforcement: own data only (404 otherwise), consent withdrawal stops doctor access at once and is audited, sign-out revokes sessions server-side, export and deletion jobs run in the worker with an audit trail, family members stay under the parent's account. | L | C | Access-control tests for each route; withdraw-consent test shows a doctor loses access; deletion keeps legally required records locked. | Fold into P2, P7 and P9. |
| 2026-10-02 | F-14 | **[SEC]** Doctor pages must enforce on the server: a doctor reads only patients with a booking with them (404 otherwise), summaries are logged in the PHI access log, availability changes cannot cancel booked slots, earnings and payouts come from the ledger, never from the browser. Bank details collection and verification (KYC) is a separate task for the payments phase. | L | C | Doctor A cannot read doctor B's patient or earnings (tested); every patient summary opens an audit entry. | Fold into P4, P5 and P9. |
| 2026-10-02 | F-15 | **[SEC]** The call page must not be reachable by URL alone. P6 checks on the server that the signed-in patient owns the booking, payment is captured, the time window is open and consent is given before issuing a one-user, one-channel token that expires in an hour; the doctor tile, waiting room and reconnect states then come from the real video provider. Local camera preview stays in the tab and is never uploaded. | L | C | Another patient's id returns 404; a token for a different channel is refused; renewal after the session ends is denied (tested). | Fold into P6-06 and P6-07. |
| 2026-10-02 | F-03 | `next dev` appends an "agent rules" block to `CLAUDE.md` each time it runs. | S | H | Human decides whether to keep it. If kept, commit it. If not, find the Next.js setting that stops it. | Needs you. |

---

## Phase 0: Bootstrap

- [ ] **P0-01** (S, C+H) The project repo already exists at `ViniCure_Project\ViniCure` (it has a `.git` folder). Check its remote and history. Add `.gitignore` (must exclude `.env*`, `node_modules`, `.next`), `.editorconfig`, README stub. Human picks license and the remote if none exists. *AC:* first commit pushed, branch protection on `main` (human).
- [ ] **P0-02** (S, C) Pin toolchain: Node 24 (`.nvmrc`, `engines`), pnpm through corepack (`packageManager`). *AC:* `node -v` shows 24.x locally, in CI and in Docker.
- [ ] **P0-03** (M, C) Scaffold Next.js. Read the Next.js security posts first and install the latest patched 16.3.x. TypeScript strict, Tailwind 4, App Router, `src/` layout, `output: "standalone"`. *AC:* `pnpm build` passes. Installed version recorded in Decisions.
- [ ] **P0-04** (S, C) Lint, format and typecheck scripts (ESLint, Prettier, `tsc --noEmit`). *AC:* `pnpm lint`, `pnpm typecheck`, `pnpm format:check` pass.
- [ ] **P0-05** (S, C) Test tooling: Vitest and Playwright, `tests/` layout, one passing sample of each. *AC:* `pnpm test` and `pnpm e2e` run.
- [ ] **P0-06** (S, C) Config module that validates environment variables with Zod (`backend-architecture.md` section 17). `.env.example` with names only. *AC:* production mode refuses to boot with a missing required variable (tested).
- [ ] **P0-07** (M, C) `docker/Dockerfile` with `web` and `worker` targets and `.dockerignore`. *AC:* images build, run as non-root, healthcheck passes.
- [ ] **P0-08** (M, C) `docker/compose.yml`: postgres, valkey, mailpit, minio with a bucket-init job, clamav, plus an `app` profile (migrate, web, worker). *AC:* `docker compose up -d` is healthy. README explains it.
- [ ] **P0-09** (M, C) GitHub Actions CI: install, lint, typecheck, tests, build, `pnpm audit` gate, secret scan, image build and Trivy scan. Pin actions to SHAs. *AC:* green on a test pull request.
- [ ] **P0-10** (S, C) Dependabot for npm, Docker, Actions and Terraform: weekly plus security updates. *AC:* config merged.
- [ ] **P0-11** (S, C) Pre-commit hooks: lint-staged and secret scan. *AC:* committing a fake secret is blocked.
- [ ] **P0-12** (S, C) Put the planning docs in `docs/`. Create `docs/adr/` with a template and stubs ADR-001 to ADR-012, and `docs/runbooks/`. *AC:* folders and stubs exist.
- [ ] **P0-13** (M, C) Blocked until P0-15 is done. Read the reference repo (path in `CLAUDE.md`). Check that every item in `architecture.md` section 14 exists in the code, not only in the old backlog: the old `MASTER_TODO.md` marks all 70 tasks done, yet the architecture review found no Razorpay checkout page, an unused hCaptcha, and Agora instead of the 100ms the backlog names. Write `docs/reuse-map.md` as a table: ViniCare file, ViniCure task IDs that should use it (for example P5-05), what to take, what to change, verified yes or no. Also list ViniCare's known gaps as test ideas for those tasks. Copy no secrets or data. *AC:* every entry names at least one task ID. Map reviewed by the human.
- [ ] **P0-14** (S, H) Fill in the Human checklist below with owners and dates. *AC:* table filled.
- [ ] **P0-15** (S, C+H) Reference repo cleanup. Human: in the copy at `../vinicare-reference` delete `node_modules`, `.next` and `.vercel`, move every `.env*` file out of it, scan for secrets, rename the old `CLAUDE.md` to `OLD-vinicare-rules.md`, then set the files read-only (PowerShell commands are in the setup guide). Claude: confirm `.claude/settings.json` lists the reference folders and `.claude/commands/port.md` exists. *AC:* no `.env*` file or private key in the reference folder (checked), Claude can read a file there and cannot write there (tested), and `/port P5-05` runs after P0-13 produces the map.
- [ ] **P0-16** (S, C) Review `../Frontend_Inspirations` and write `docs/design-notes.md`: colors, typography, layout patterns, components worth building, and which file each idea comes from. Use it for look and feel only: never copy brand assets or copyrighted images. *AC:* notes reviewed by the human. UI tasks reference this file.

## Phase F: Frontend (UI first, mock data)

Added 2026-10-02 at the human's request (D-007). Build every screen as a real Next.js page with typed mock data in `src/mocks/`, behind a thin data layer in `src/lib/data/` so later phases swap mocks for API calls without touching components. This phase covers the UI parts of P2-12, P4-08, P6-06, P6-07, P7-11, P9-08 and P10-01 to P10-06. Those tasks then only wire screens to real APIs, add tests and finish backend work.

Rules for every F task:
- Look at `../Frontend_Inspirations` and `docs/design-notes.md` first. Note which reference inspired the screen. Use our own brand: never copy a reference's logo, name, text or photos.
- Look at the matching ViniCare page in `../vinicare-reference` for panels, fields and edge cases (log it in the Progress log).
- Before designing or building any screen or component, invoke the `ui-ux-pro-max` and `frontend-design` skills (both are in `.claude/skills/`) and follow them. Note in the Progress log that both were used. Decisions in this file and the security rules win over a skill suggestion.
- Run the `ui-ux-pro-max` checklist: contrast 4.5:1, visible focus, 44px touch targets, labels on inputs, reduced motion, no emoji icons, no horizontal scroll at 375px.
- UI only. No secrets, no real patient data, no tokens in localStorage, no `dangerouslySetInnerHTML`. Mock data is fake and marked as fake. Forms validate with Zod on the client for experience only, and the server will enforce the same schemas later.
- Responsive at 375, 768, 1024 and 1440 px, light theme first.
- Doctor registration number shown wherever a doctor appears (compliance rule).
- *AC (all F tasks):* `pnpm lint`, `pnpm typecheck` and `pnpm build` pass. The page is checked in the browser at the four widths. No serious axe violations.

**Foundation**
- [x] **F-01** (S, C) Review `../Frontend_Inspirations` and the ViniCare panels. Write `docs/design-notes.md` (this is P0-16): palette, type, spacing, radius, component list, screen inventory, and which reference each idea comes from. Use the ui-ux-pro-max search for the starting point. *AC:* notes list every screen in this phase with its inspiration.
- [x] **F-02** (M, C) Scaffold Next.js (covers P0-02 to P0-04): Node 24, pnpm through corepack, latest patched Next.js after reading the security posts, TypeScript strict, Tailwind 4, App Router, `src/` layout, route groups `(public)`, `(patient)`, `(doctor)`, `(admin)`, ESLint, Prettier, `.gitignore`, `.env.example`. *AC:* `pnpm dev`, `build`, `lint`, `typecheck` pass. Installed version in Decisions.
- [x] **F-03** (M, C) Design tokens and primitives: colors, type (Figtree and Noto Sans), spacing, radius, shadows as CSS variables in `globals.css`. Components: Button, Input, Select, Checkbox, OTP input, Card, Badge, Avatar, Tabs, Dialog, Sheet, Toast, Tooltip, Skeleton, Table, Pagination, EmptyState. Icons from one set (Phosphor). Logo component using the files in `Frontend_Inspirations/logos` (temporary: the human will replace the logo). *AC:* a `/design` preview page (dev only) shows every component and state, including focus and disabled.
- [x] **F-04** (M, C) App shells: public header and footer, dashboard shell with sidebar and top bar for patient, doctor, admin and support (support console lives under `/staff/*` so it does not nest inside the admin shell), mobile bottom navigation (4 tabs plus a More sheet), breadcrumbs, page header, notification bell, account menu, skip link. The language switch is added in F-22, so no dead control is shown now. *AC:* navigation works at all four widths and by keyboard.

**Public site**
- [x] **F-05** (L, C) Home page. Inspired by Med24 and Doccure layout ideas, our own copy and colors. Sections: hero with search for doctor or specialty, how it works in three steps, specialties grid, featured doctors, consultation types, trust strip (registration verified, encrypted records, India-based data), patient stories, app-style benefits, FAQ teaser, final call to action. *AC:* page matches the notes, Lighthouse accessibility above 90.
- [x] **F-06** (L, C) Sign-in and sign-up pages. Patient: phone number, OTP entry, resend timer, consent line. Staff: email, password, TOTP step, backup code, forgot and reset password, change password. Doctor application entry. Clear error and lockout messages. No account enumeration wording. *AC:* every state reachable with mock data and keyboard only (covers the UI part of P2-12 and P2-16).
- [x] **F-07** (L, C) Doctor directory and doctor profile. Search, filters (specialty, language, fee, available today), sort from an allow-list, cards, pagination, profile with registration number, qualifications, languages, reviews, fees and next slots. *AC:* filters work on mock data and URL query holds the state.
- [x] **F-08** (L, C) Booking flow: slot picker (timezone IST), patient or family member choice, reason, consent, summary with fee, checkout UI (Razorpay-style, mock), success and failure screens, hold timer. *AC:* all steps and failure paths reachable.
- [x] **F-09** (M, C) Trust and compliance pages: how it works, specialties list, doctor verification, patient rights, privacy policy, terms, cookie policy, grievance contact. Text is placeholder marked for legal review. *AC:* pages exist, banner says "draft, pending legal review" until P9-10.
- [x] **F-10** (M, C) Content pages: blog list and article, FAQ with accordion, patient stories, support and contact form, about. *AC:* pages reachable, FAQ accessible by keyboard.

**Patient panel**
- [x] **F-11** (M, C) Patient dashboard and appointments: next consultation card, quick actions, upcoming and past, reschedule and cancel dialogs, follow-ups. *AC:* all states including empty.
- [x] **F-12** (L, C) Health records vault: files grouped by type (injury photos, prescriptions, reports, X-rays, MRI, CT, other), filters, search, view, download and share with doctor. Injury photo flow: camera or gallery, quality hint, crop and rotate, note, privacy notice, upload progress and scan states. Inspired by the injury-photo and patient-files references. *AC:* upload states (uploading, scanning, ready, rejected) all visible.
- [x] **F-13** (M, C) Profile and settings: personal details, family members and minors, medical history and conditions, allergies, emergency contact, consents with withdrawal, active sessions and devices, data export and delete request, referral page. *AC:* all forms have labels and error states.

**Doctor panel**
- [x] **F-14** (L, C) Doctor dashboard and tools: availability toggle, today's queue, next consultation, calendar and availability rules, patients list, earnings and payout view. Desktop and mobile layouts. *AC:* mobile layout matches the doctor-mobile reference intent at 375px.
- [x] **F-15** (L, C) Patient-side consultation: join lobby, device and network check, permissions help, waiting room, live call screen with controls and reconnect state, audio-only fallback, end and feedback screens. *AC:* all states reachable with a mock video tile (the real video comes in P6-06).
- [ ] **F-16** (L, C) Doctor consultation console: video beside a patient context panel (alerts, allergies, history, files), notes, prescription builder with medicine search, dose, frequency, duration, advice, preview, and send. Desktop, tablet and mobile layouts like the ClarityCare references. *AC:* three layouts work. Registration number shown on the prescription preview.
- [ ] **F-17** (M, C) Doctor onboarding: application form, qualification and registration number fields, KYC document upload states, status tracker (submitted, under review, approved, rejected). *AC:* all states visible.

**Admin and support**
- [ ] **F-18** (L, C) Admin console: dashboard with charts, users, doctor list and KYC review, appointments, revenue and refunds, audit logs and PHI access log, data requests, attendance. Tables sort and filter from allow-lists. Admin never shows clinical text. Inspired by Hummingbird. *AC:* every page works with mock data. Chart colors pass contrast.
- [ ] **F-19** (M, C) Support console: ticket queue, user lookup, break-glass access dialog (reason, time limit, countdown banner). *AC:* break-glass flow and expiry state visible.

**Quality and finish**
- [ ] **F-20** (M, C) Loading skeletons, empty states, error boundaries, custom 404 and 500, offline and slow-network messages, toasts. *AC:* every page has all four states.
- [ ] **F-21** (M, C) Accessibility and responsive pass over the whole site: axe, keyboard walk-through, reduced motion, focus not hidden by sticky bars, 375 to 1440 px. Fix findings. *AC:* no serious axe violations on key pages. Screenshots stored in `docs/ui-checks/`.
- [ ] **F-22** (M, C) i18n scaffolding (UI part of P10-02): all copy in message files, English complete, Hindi and Gujarati keys present, language switch works. *AC:* switching language changes visible text on home and sign-in.
- [ ] **F-23** (S, C) Wiring plan: list every mock in `src/mocks/` with the P-task and endpoint that replaces it, so later phases can swap them. *AC:* table in `docs/ui-wiring.md`, reviewed by the human.

## Phase 1: Platform foundations

- [ ] **P1-01** (S, C) Database module: Drizzle with a pg pool, graceful shutdown, pool-size config. *AC:* connection test passes and the pool closes cleanly.
- [ ] **P1-02** (M, C) Migration tooling: numbered SQL files in `db/migrations`, runner (`pnpm db:migrate`), compose `migrate` job. Confirm Drizzle coexists with hand-written SQL. CI applies all migrations to an empty database. *AC:* CI step green. Decision logged.
- [ ] **P1-03** (S, C) Baseline migration: `btree_gist` extension, roles `migrator` and `app`, `updated_at` trigger. *AC:* `app` role cannot run DDL (tested).
- [ ] **P1-04** **[SEC]** (S, C) Logger: pino JSON, request ID, redaction list (`backend-architecture.md` section 15). *AC:* test proves phone, email, tokens, OTP and `*_enc` fields are redacted.
- [ ] **P1-05** (S, C) Error model: typed errors, problem-details responses, Zod error mapping. *AC:* tests for each error code.
- [ ] **P1-06** **[SEC]** (M, C) `withApi()` wrapper and route registry (`backend-architecture.md` section 2). *AC:* unit tests pass. A CI test fails if a route file does not use it.
- [ ] **P1-07** (S, C) Cache module: Valkey client, key naming, TLS option, health check. *AC:* tests with compose Valkey.
- [ ] **P1-08** **[SEC]** (M, C) Rate limiter with the tiers in section 5, headers and `Retry-After`. Sensitive tiers (OTP, sign-in, payments, admin) fail closed if the cache is down. Public read tiers fail open with an alert, so a cache outage does not take the site down. Rate-limit hits are logged as security events and counted in metrics. *AC:* the 6th rapid request on a 5-per-minute tier returns 429 with `Retry-After`. State survives an app restart. Tests cover cache-down behavior for both kinds of tier.
- [ ] **P1-09** **[SEC]** (M, C) Crypto module: envelope encryption, key IDs, local and KMS providers, rotation helper. *AC:* tamper, wrong-key, rotation and old-value tests pass. A value that cannot be decrypted returns null and logs an error that contains no data. It never crashes the request.
- [ ] **P1-10** (M, C) Storage module: S3 client, presigned PUT and GET with short TTL, MinIO locally. *AC:* upload and download test through compose.
- [ ] **P1-11** (M, C) Queue module: pg-boss for enqueue (web) and consume (worker), queue registry, retry and dead-letter policy. *AC:* a job runs, retries and lands in the dead-letter queue in tests.
- [ ] **P1-12** (S, C) Worker entry point: health, graceful shutdown, Docker target. *AC:* container starts and stops cleanly.
- [ ] **P1-13** (M, C) Adapter interfaces and fake implementations for video, payments, SMS, WhatsApp, email, AI and scanner (`backend-architecture.md` section 9). *AC:* a shared contract test suite passes on the fakes.
- [ ] **P1-14** **[SEC]** (M, C) `src/proxy.ts`: CSP with nonce, HSTS, frame-ancestors none, referrer and permissions policies, Origin check for mutating requests. *AC:* header snapshot test. `curl -I` shows every header. Camera and microphone are allowed only on the video join page and blocked everywhere else.
- [ ] **P1-15** (S, C) `/api/health` and `/api/ready`, no writes. *AC:* tests.
- [ ] **P1-16** **[SEC]** (M, C) Idempotency support (Valkey fast path, `idempotency_keys` record). *AC:* replay returns the same response. A changed request returns 422.
- [ ] **P1-17** **[SEC]** (M, C) Audit service (append-only writer) and PHI access log helper, with grants in the migration. *AC:* `app` role cannot update or delete these tables (tested). A test fails if audit metadata contains forbidden keys (name, phone, email, date of birth, address, clinical text, token). Each entry records IP and user agent.
- [ ] **P1-18** **[SEC]** (S, C) Sentry for server and browser with PII scrubbing. *AC:* test shows PII fields removed.
- [ ] **P1-19** (M, C) OpenAPI generation from Zod and a CI check for undocumented routes. *AC:* CI step green.
- [ ] **P1-20** (S, C) Feature flags from config (`FEATURE_AI_TRIAGE`, `FEATURE_RECORDING`, `FEATURE_REFERRALS`), default off. *AC:* tests.
- [ ] **P1-21** **[SEC]** (M, C) Adapter resilience wrapper: timeouts, retries only where safe, circuit breaker, defined fallback per provider, metrics. *AC:* tests simulate provider timeout, error burst and recovery.

## Phase 2: Identity and access

- [ ] **P2-01** (M, C) Better Auth tables: generate, rename to `users` and `auth_*`, use UUID IDs if possible, review the SQL, add the migration. Confirm UUID support. *AC:* migration applies. Decision logged.
- [ ] **P2-02** **[SEC]** (M, C) Better Auth setup behind `modules/identity`: Postgres adapter, cookie flags, session lifetimes, trusted origins. *AC:* test checks cookie flags and lifetimes.
- [ ] **P2-03** **[SEC]** (M, C) Phone OTP with the MSG91 adapter (fake first), `signUpOnVerification`, E.164 normalization, +91 allow-list. Confirm where OTPs are stored. *AC:* sign-in works with the fake SMS. OTP never appears in logs.
- [ ] **P2-04** **[SEC]** (M, C) OTP abuse controls: hCaptcha, per-phone and per-IP limits, daily SMS budget cap with alert. *AC:* abuse-scenario tests pass.
- [ ] **P2-05** **[SEC]** (M, C) Staff authentication: email, password and mandatory TOTP, backup codes, phone-only sign-in blocked for staff. *AC:* test proves a staff account cannot sign in by phone alone.
- [ ] **P2-06** **[SEC]** (M, C) Invitations: admin creates, token expiry, accept flow with password and TOTP enrolment. *AC:* tests including expired and reused tokens.
- [ ] **P2-07** **[SEC]** (M, C) Policy module with `can.*` functions for the matrix in `backend-architecture.md` section 4. *AC:* unit tests cover every cell.
- [ ] **P2-08** **[SEC]** (M, C) Access-control matrix test harness: enumerates all routes and roles and fails on any route missing from the matrix. *AC:* runs in CI.
- [ ] **P2-09** (M, C) Patient profiles: create, edit, delete for family members, minors flag, address and date of birth. *AC:* tests including ownership.
- [ ] **P2-10** **[SEC]** (M, C) Sessions: list, revoke, sign out everywhere, fresh-login guard for sensitive actions. *AC:* tests.
- [ ] **P2-11** (S, C) Account deletion request entry point that creates a data request. *AC:* request row created and audited.
- [ ] **P2-12** (M, C) UI: patient OTP sign-in, staff sign-in, 2FA enrolment, profile. *AC:* Playwright flows pass.
- [ ] **P2-13** (S, C) Auth security review: walk the Better Auth docs against our config, write threat notes in ADR-004, resolve every "Not verified" auth item. *AC:* ADR updated, human reviews.
- [ ] **P2-14** **[SEC]** (M, C) Security test suite: SQL injection and XSS payloads, CSRF and Origin checks, broken-auth cases, rate-limit bypass attempts, privilege escalation, upload abuse. Extend it as features land. *AC:* runs in CI and fails the build on any success of an attack case.
- [ ] **P2-15** **[SEC]** (M, C) Password hashing and lockout: confirm the algorithm Better Auth uses, configure Argon2id if supported (else bcrypt or scrypt per OWASP), failed-attempt backoff and temporary lockout for staff, other sessions invalidated on password change or reset. *AC:* tests prove each behavior. Choice recorded in ADR-004.
- [ ] **P2-16** **[SEC]** (M, C) Staff password reset by emailed link: single-use token with short expiry, 3 requests per 15 minutes per IP, the same response whether or not the email exists, other sessions invalidated on reset. *AC:* tests for account enumeration, token reuse, expiry, rate limit and session invalidation.

## Phase 3: Cloud staging

- [ ] **P3-01** (S, H) AWS account with MFA, organization, billing alarm, default region `ap-south-1`. *AC:* human confirms.
- [ ] **P3-02** (M, C) Terraform skeleton: remote state with locking, environments `staging` and `production`, module layout. *AC:* `terraform plan` is clean.
- [ ] **P3-03** (M, C) Network: VPC, public, private and data subnets, VPC endpoints, security groups. *AC:* plan reviewed.
- [ ] **P3-04** **[SEC]** (M, C) RDS PostgreSQL (staging single-AZ, production Multi-AZ), KMS encryption, point-in-time recovery, no public access, snapshot copy to `ap-south-2`. *AC:* applied in staging, restore tested.
- [ ] **P3-05** (S, C) ElastiCache Valkey with TLS and auth. *AC:* reachable only from tasks.
- [ ] **P3-06** **[SEC]** (M, C) S3 buckets: private, versioning, KMS encryption, lifecycle, replication of records to `ap-south-2`. *AC:* public access blocked (checked).
- [ ] **P3-07** (M, C) ECR, ECS cluster, task definitions (web, worker, scanner, migrate), services, autoscaling, read-only root filesystem where possible. *AC:* tasks healthy.
- [ ] **P3-08** **[SEC]** (M, C) ALB, ACM certificate, CloudFront, WAF managed and rate rules, HTTPS only. *AC:* HTTP redirects. WAF blocks a test pattern.
- [ ] **P3-09** **[SEC]** (M, C) Secrets Manager and IAM roles with least privilege, no static keys. *AC:* tasks read only their own secrets.
- [ ] **P3-10** **[SEC]** (M, C) CloudWatch log groups (retention 180 days or more), alarms, SNS alerts, dashboards. *AC:* a test alarm reaches the human.
- [ ] **P3-11** (S, C+H) SES domain identity, SPF, DKIM, DMARC, production access request. *AC:* test email delivered.
- [ ] **P3-12** (M, C) CD pipeline: build, push to ECR, migrate, deploy staging, smoke tests, manual approval, production, rollback. *AC:* rollback rehearsed in staging.
- [ ] **P3-13** (S, H) Choose and register the domain, set DNS. *AC:* domain resolves to staging.
- [ ] **P3-14** (S, C) Staging smoke test: deploy the skeleton and see `/api/ready` green through CloudFront. *AC:* evidence in log.

## Phase 4: Directory and scheduling

- [ ] **P4-01** (M, C) Migration: doctors, specialties, KYC documents, availability rules, time off. *AC:* applies on empty database.
- [ ] **P4-02** **[SEC]** (L, C) Doctor application and KYC upload pipeline (presign, upload, scan, activate). Admin approve, reject, suspend. *AC:* access-control tests. Infected file rejected.
- [ ] **P4-03** (M, C) Public directory APIs (cacheable): specialties, list, search, profile with registration number and qualifications. Filters: specialty, language, fee range, available today. Sort fields come from an allow-list. *AC:* cache headers set. Only approved and active doctors appear (tested). Tests.
- [ ] **P4-04** (M, C) Slot generation from rules minus time off minus booked slots, short cache. *AC:* unit tests for boundaries, overlaps and midnight.
- [ ] **P4-05** **[SEC]** (M, C) Appointment hold with the exclusion constraint, fee copy, hold TTL, idempotency. *AC:* 10 concurrent requests for the same slot: exactly 1 succeeds and 9 get 409. The database shows exactly one active row for that slot.
- [ ] **P4-06** (M, C) Appointment state machine, status history, cancel and reschedule rules, policies. *AC:* state tests. Access-control tests.
- [ ] **P4-07** (S, C) Job to release expired holds, with the late-payment hook. *AC:* test.
- [ ] **P4-08** (L, C) UI: directory, doctor profile, slot picker, my appointments, doctor schedule and availability. *AC:* Playwright flows.
- [ ] **P4-09** (S, C) Seed data and fixtures: fake doctors and specialties. *AC:* `pnpm db:seed` works and is re-runnable.
- [ ] **P4-10** (M, C) Reviews and favorites: one review per completed appointment by the booking patient, moderation status, cached doctor rating average, add and remove favorites. *AC:* a review before completion, or by another patient, is rejected (test). Only published reviews are public.

## Phase 5: Payments

- [ ] **P5-01** (M, C) Migration: payments, events, refunds, invoices, ledger, payouts, referrals. *AC:* applies.
- [ ] **P5-02** (M, C+H) Razorpay adapter (orders, fetch, refund, signature and webhook verification) with a fake. Human supplies test keys. *AC:* contract tests pass on fake and on sandbox.
- [ ] **P5-03** **[SEC]** (M, C) `POST /payments/orders`: amount from the appointment fee, fresh order per attempt, idempotent. *AC:* a test proves a client cannot change the amount.
- [ ] **P5-04** (M, C) Checkout UI and `POST /payments/verify`. Fulfil only when the payment is captured. *AC:* Playwright flow in test mode.
- [ ] **P5-05** **[SEC]** (M, C) Webhook endpoint: raw-body verification, dedupe by event ID, ordered state changes, retries. *AC:* replay, out-of-order and bad-signature tests.
- [ ] **P5-06** (M, C) Earnings ledger on capture with platform fee. Daily reconciliation job with alert. *AC:* tests.
- [ ] **P5-07** **[SEC]** (M, C) Refunds: rules, partial refunds, ledger reversal, admin endpoint with fresh login. *AC:* tests.
- [ ] **P5-08** (M, C+H) Invoices: sequential numbering per financial year, PDF rendered in the worker. Accountant confirms tax fields. *AC:* PDF test. Human sign-off.
- [ ] **P5-09** (S, C) Payout export (CSV) for manual settlement. *AC:* test.
- [ ] **P5-10** (S, C) Referrals behind a flag. *AC:* caps and abuse tests.
- [ ] **P5-11** **[SEC]** (M, C) Payment test suite: amount tamper, replay, out-of-order events, late payment after hold expiry, refund edge cases. *AC:* all pass in CI.

## Phase 6: Video consultation

- [ ] **P6-01** (S, C) Migration: consultations, participants, recordings. *AC:* applies.
- [ ] **P6-02** (M, C+H) Agora adapter (token builder) with a fake. Human creates the Agora project with token authentication on. *AC:* contract tests pass.
- [ ] **P6-03** **[SEC]** (M, C) Join endpoint: assignment, payment captured, window, consent checks. Per-user UID, random channel, 1-hour token. *AC:* tests for each check.
- [ ] **P6-04** **[SEC]** (M, C) Token renewal and end endpoints, revocation, audit. *AC:* renewal after end is denied.
- [ ] **P6-05** **[SEC]** (S, C) Consent capture before the first join (video and telemedicine). *AC:* join is denied without consent.
- [ ] **P6-06** (L, C) Join UI: device check, network test, lobby, controls, audio-only fallback, reconnect. *AC:* Playwright with the fake video provider.
- [ ] **P6-07** (M, C) Doctor console with a split screen: video on one side, notes and prescription builder on the other, plus a patient context panel (history, vitals, documents). Every clinical read is logged. *AC:* every read produces a PHI access log entry. Layout works on a laptop screen.
- [ ] **P6-08** (M, C) Recording behind a flag: both consents, Mumbai bucket, retention job. *AC:* off by default. Tests.
- [ ] **P6-09** **[SEC]** (M, C) Video security tests: unauthorized join, outside window, renewal after end, wrong doctor. *AC:* pass in CI.
- [ ] **P6-10** (M, C+H) Pilot comparing Agora with one alternative on real Indian mobile networks. Record results in ADR-008. *AC:* ADR updated, human decides.
- [ ] **P6-11** (S, C) Evaluate media-encryption options (provider-side encryption, end-to-end feasibility) and record the decision in ADR-008. *AC:* ADR updated, human informed.

## Phase 7: Clinical records

- [ ] **P7-01** (M, C) Migration: clinical tables. *AC:* applies.
- [ ] **P7-02** **[SEC]** (M, C) Notes: versioned, encrypted, doctor-only. *AC:* tests including access control.
- [ ] **P7-03** (L, C+H) Prescriptions: create, issue, revoke, Rx number, drug-restriction hook. Human supplies the legal lists. *AC:* tests. Revoked prescriptions cannot be edited.
- [ ] **P7-04** (M, C) PDF renderer in the worker (one library). Registration number and qualifications on every PDF. The browser never builds the PDF and never sees clinical text in network calls: it receives only a short-lived signed URL. *AC:* test checks PDF content. The signed URL expires after about 15 minutes and a later request returns 403. The browser network log shows only the signed URL.
- [ ] **P7-05** **[SEC]** (S, C) Public QR verification showing validity only. *AC:* test proves no clinical content is exposed.
- [ ] **P7-06** (M, C) Vitals and conditions (patient and doctor input) with charts. *AC:* tests.
- [ ] **P7-07** **[SEC]** (M, C) Document upload pipeline with ClamAV. *AC:* the EICAR test string is rejected. A file whose extension or MIME type does not match its magic bytes (for example `.jpg` containing PDF data) is rejected. Oversize files are rejected.
- [ ] **P7-08** (S, C) Follow-ups. *AC:* tests.
- [ ] **P7-09** (M, C) Drug interaction advisory adapter. Evaluate an Indian-relevant data source and label output as advisory. *AC:* decision logged.
- [ ] **P7-10** (M, C) AI triage behind a flag: consent, redaction, budget, disclaimer. It never creates prescriptions. *AC:* tests.
- [ ] **P7-11** (L, C) UI: doctor consultation screen (notes and prescription builder, shown beside the video in the P6-07 split screen), patient records and prescriptions. *AC:* Playwright flows.

## Phase 8: Notifications and jobs

- [ ] **P8-01** (S, C) Migration: notifications. *AC:* applies.
- [ ] **P8-02** (M, C+H) MSG91 adapter and templates. Human completes DLT registration and template approval. *AC:* test SMS delivered in staging.
- [ ] **P8-03** (M, C+H) WhatsApp adapter and templates. Human completes Meta business verification. *AC:* test message delivered in staging.
- [ ] **P8-04** (M, C) SES email adapter and templates with no patient data. *AC:* test email delivered.
- [ ] **P8-05** (M, C) Notification service: channel fallback, dedupe, delivery status, registration number in templates where required. *AC:* template test.
- [ ] **P8-06** (M, C) Reminder jobs: 24 hours and 1 hour before, moved or cancelled when the appointment changes. *AC:* tests.
- [ ] **P8-07** (S, C) Job monitoring: dead-letter alarms and queue-depth metrics. *AC:* alarm fires in a test.
- [ ] **P8-08** (-, -) Push notifications. Deferred to P12-03.

## Phase 9: Compliance and admin

- [ ] **P9-01** (S, C) Migration: consents, data requests, incidents. *AC:* applies.
- [ ] **P9-02** (M, C) Consent policy management, versioned consent UI, withdrawal, guardian consent for minors. *AC:* tests.
- [ ] **P9-03** (M, C) Data export job and download. *AC:* export contains only the requester's data (test). One export per 24 hours per patient: a second request returns 429. The download link expires after 1 hour.
- [ ] **P9-04** **[SEC]** (M, C+H) Erasure job with anonymization and retention exceptions. Human supplies the legal rules. *AC:* tests.
- [ ] **P9-05** (M, C) PHI access log viewer for admins, optional patient-facing access history. *AC:* tests.
- [ ] **P9-06** **[SEC]** (M, C) Break-glass access for support: reason, time limit, alert. *AC:* tests and alert check.
- [ ] **P9-07** **[SEC]** (S, C) Incident register and the CERT-In 6-hour runbook, alert wiring. *AC:* runbook reviewed.
- [ ] **P9-08** (L, C) Admin console: users, doctors and KYC, appointments, revenue, refunds, logs, data requests. *AC:* access-control tests, Playwright flows.
- [ ] **P9-09** (S, C) Retention jobs. *AC:* tests with fake clock.
- [ ] **P9-10** (M, H) Privacy notice, terms and consent texts from legal, plus translations. *AC:* texts loaded as consent policies.
- [ ] **P9-11** (M, C) Automated telemedicine-guideline checks: registration number everywhere, patient ID fields, minors flow. *AC:* checks pass in CI.
- [ ] **P9-12** **[SEC]** (M, C) Suspicious sign-in detection and alerts: many failures, new device, unusual location. Alert the user and admins. *AC:* tests with simulated patterns.
- [ ] **P9-13** **[SEC]** (S, C) Admin CSV exports (revenue, appointments, refunds): audited, rate limited, row limits, no clinical content, short-lived signed download. *AC:* tests show no clinical columns and one audit entry per export.

## Phase 10: Frontend polish

- [ ] **P10-01** (M, C) Design tokens from `docs/design-notes.md` (P0-16), responsive layouts, accessibility checks with axe. *AC:* no serious violations on key pages.
- [ ] **P10-02** (M, C+H) i18n scaffolding for English, Hindi and Gujarati. Human reviews translations. *AC:* language switch works.
- [ ] **P10-03** (S, C) Public pages (static or incremental), sitemap, metadata. *AC:* build output checked.
- [ ] **P10-04** (M, C) Performance budget with Lighthouse CI. Agora SDK code-split. WebP images. *AC:* budgets enforced in CI.
- [ ] **P10-05** (S, C) Error boundaries, custom 404 and 500 pages, loading skeletons and empty states. Optional installable web app. *AC:* pages reviewed.
- [ ] **P10-06** (M, C+H) Content: home, specialties, how it works, FAQs, contact, patient rights, and a support and grievance contact. Human confirms what the law requires. *AC:* human approves copy.

## Phase 11: Hardening and launch

- [ ] **P11-01** (M, C) Load tests with k6 for directory, booking and OTP. Record baselines. *AC:* results in docs.
- [ ] **P11-02** **[SEC]** (M, C) Walk the OWASP API Top 10 table in `backend-architecture.md` section 13 and fix gaps. *AC:* each row has evidence.
- [ ] **P11-03** **[SEC]** (L, H) Independent penetration test and remediation. *AC:* report and fixes.
- [ ] **P11-04** (M, C+H) Backup restore drill (database point-in-time recovery and S3), documented. *AC:* drill report.
- [ ] **P11-05** (M, C+H) Cross-region recovery drill using `ap-south-2`, documented. *AC:* drill report.
- [ ] **P11-06** (M, C) Complete runbooks: deploy, rollback, incident, key and secret rotation, template changes, restore. *AC:* each rehearsed once.
- [ ] **P11-07** (S, C+H) Fire-test every alarm. *AC:* each alert received.
- [ ] **P11-08** (M, H) Legal and accounting sign-off: notices, consents, retention, telemedicine compliance, invoices. *AC:* written sign-off.
- [ ] **P11-09** (L, H) Pilot with a few doctors and patients, collect feedback. *AC:* feedback triaged into tasks.
- [ ] **P11-10** (M, C+H) Go-live checklist, DNS cutover, monitoring watch. *AC:* checklist complete.

## Phase 12: After launch

- [ ] **P12-01** (L, C) ABDM milestone 1: ABHA linking.
- [ ] **P12-02** (L, C) ABDM record sharing and FHIR.
- [ ] **P12-03** (M, C) Push notifications.
- [ ] **P12-04** (M, C) Privacy-safe analytics.
- [ ] **P12-05** (L, C) Mobile apps or an installable web app.
- [ ] **P12-06** (M, C) Doctor payout automation.
- [ ] **P12-07** (S, C) Move to Node 26 LTS once it is promoted (planned 28 October 2026) and dependencies support it. This may be done earlier.
- [ ] **P12-08** (L, C) Multi-clinic support if the business needs it.

---

## Human checklist

Things Claude Code cannot do for you. Fill the owner and date.

| Item | Needed by | Lead time | Owner | Status |
|---|---|---|---|---|
| GitHub repo and branch protection | P0-01 | Short | | |
| Sentry project | P1-18 | Short | | |
| hCaptcha site and secret | P2-04 | Short | | |
| AWS account, MFA, billing alarm | P3-01 | Short | | |
| Domain registration and DNS | P3-13 | Short | | |
| SES production access | P3-11 | Days | | |
| Razorpay account, test keys, then live KYC | P5-02 | Days to weeks | | |
| Agora project with token authentication | P6-02 | Short | | |
| SMS provider account and DLT registration | P8-02 | Weeks. Start now. | | |
| Meta business verification and WhatsApp number | P8-03 | Weeks. Start now. | | |
| Claude API key (optional, for AI triage) | P7-10 | Short | | |
| Lawyer: privacy notice, terms, consents, retention, drug lists, location rules | P9-10, P11-08 | Weeks | | |
| Accountant: invoice and tax handling | P5-08 | Days | | |
| Penetration test vendor | P11-03 | Weeks | | |
| Translation review (Hindi, Gujarati) | P10-02 | Days | | |

---

## Decisions log

| Date | ID | Decision | Reason |
|---|---|---|---|
| 2026-10-02 | D-001 | Modular monolith on Next.js plus worker, one image | See ADR-001 |
| 2026-10-02 | D-002 | PostgreSQL with SQL migrations as source of truth | See ADR-002 |
| 2026-10-02 | D-003 | Better Auth, self-hosted, staff TOTP mandatory | See ADR-004. Needs the P2-13 review. |
| 2026-10-02 | D-004 | Node 24 now, Node 26 after it enters LTS | Node 22 is in maintenance. Node 20 is end of life. |
| 2026-10-02 | D-005 | AWS Mumbai primary, Hyderabad for backups | Both regions offer the services needed |
| 2026-10-02 | D-006 | Rate limiter: sensitive tiers fail closed, public reads fail open with an alert | ViniCare chose fail-open everywhere to avoid outages. Both risks matter, so it depends on the route. |
| 2026-10-02 | D-007 | Build the frontend first (Phase F) on typed mock data, then backend phases wire to it | Human decision. Reverses the earlier "backend before UI" order for UI work only. Security tasks (P1, P2) are not dropped or reordered. Nothing in Phase F may skip a security rule. |
| 2026-10-02 | D-008 | Visual direction: soft, trustworthy, professional. Calm teal and slate, off-white surfaces, warm amber and soft red only for alerts | Human asked for soft, trustworthy colors and said the logo will change, so the palette is not tied to it. Logo file used for now: `ViniCure_logo_no_background.png`. |
| 2026-10-02 | D-010 | Toolchain pins: Next.js 16.3.8 (latest patched, September 2026 security release read first), React 19.3.0, Tailwind 4.3.3, TypeScript 5.9.3, ESLint 9.39.5, pnpm 12.8.1, Node 24 | TypeScript 7 and ESLint 10 are newer, but `eslint-config-next` relies on typescript-eslint 8, so we stay on the versions it is built for. Revisit with P12-07. pnpm is installed with `npm i -g pnpm` because `corepack enable` needs admin rights on this PC. |
| 2026-10-02 | D-011 | pnpm build scripts denied for `unrs-resolver` (`allowBuilds` in `pnpm-workspace.yaml`) | It ships prebuilt binaries as optional packages, so no install-time script is needed. Fewer scripts running on install is safer. |
| 2026-10-02 | D-012 | Logos in `public/brand/` are derived from `ViniCure_Logo.png` (teal on white), not from `ViniCure_logo_no_background.png` | The "no background" file is a 24-bit image with a checkerboard drawn into the pixels, so it has no real transparency. Real transparent versions (`logo.png`, `logo-light.png` in white) were generated. Human will replace the logo later: all uses go through `components/ui/logo.tsx`. |
| 2026-10-02 | D-013 | Docker setup (P0-07, P0-08) is not needed for Phase F (frontend, mock data). Skip local Dockerfile and compose until Phase 1+ when backend services start | Keeps frontend dev lean. Dockerfile and compose.yml specifications written in Phase 0 planning but implementation deferred to P1-02 when database, cache and services are needed |
| 2026-10-02 | D-014 | Staff password rule in the UI: 12 or more characters with lower case, upper case, a number and a symbol. Patients have no password. | A working default so the screens are complete. Confirm or change it in the P2 password policy task together with the Argon2id choice. Lockout length (15 minutes) and reset link life (30 minutes) shown in the UI are also placeholders to confirm. |
| 2026-10-02 | D-009 | No neumorphism, despite the design tool suggesting it | Its own notes rate accessibility risk high (low-contrast edges). Flat surfaces with thin borders and soft shadows instead. |

## Progress log

Newest first. One line per finished task.

| Date | Task | What changed | Checks | Commit |
|---|---|---|---|---|
| 2026-10-02 | F-15 | Patient-side consultation at `/consultation/[id]/lobby` (full-window layout without site chrome): lobby with real camera and microphone permission request on a button press, live self preview, microphone level meter, simulated connection test, status lines with icon and words, permission help for Chrome, Safari and computer, audio-only join and automatic suggestion on a weak network, waiting room that moves to the call when the doctor joins, live call with a mock doctor tile, self tile, mute and camera buttons with pressed state, audio-only switch, connection badge, elapsed time, recording shown as off, doctor registration in the side panel, reconnect flow (3 attempts, then try again or continue by audio), end-call confirm, end screen with next steps and feedback (stars, tags, comment). Index route redirects to the lobby; unknown id is 404; finished or cancelled bookings show “not open”. `?state=lowbw` shows the weak network path. Skills: `ui-ux-pro-max` (no call-specific match, so Quick Reference rules for labelled controls, timeout feedback with retry, focus on screen change) and `frontend-design` used. Inspired by the Individual Counselling call reference (two tiles, avatar when video off, bottom control row with timer and red end button, info rail). Reused from ViniCare (`src/app/consultation/[sessionId]/page.jsx`): consent before joining and a session page that checks access. Changed: pre-join device check, waiting room, reconnect and audio fallback. Found and fixed: lobby 1px sideways overflow at 375px, low contrast of the prototype box on the dark call screen | lint pass, types pass, build pass, axe 0 violations on lobby (no devices, devices ok), waiting, live at all four widths, reconnecting, disconnected, end dialog and end screen, no sideways scroll, browser run with and without fake camera: blocked and missing device help, join disabled until checks pass, mic and camera toggles, weak and dropped connection, retry, audio only, end confirm, feedback validation then sent, low-bandwidth path, 404 and redirect | b0ae58b |
| 2026-10-02 | F-14 | Doctor workspace: `/doctor/dashboard` (availability switch with away state, today's and follow-up tiles, next consultation with a start button that opens 10 minutes before and an allergy warning, today's queue, earnings shortcut), `/doctor/consultations` (Today, Upcoming, Past), `/doctor/calendar` (booked this week, weekly hours editor with per-day validation and error summary, time off with add and remove), `/doctor/patients` (search and New/Follow-up filters, summary sheet showing only patients who booked this doctor, access is logged), `/doctor/earnings` (summary, payouts table with statuses incl. on hold for unverified bank, recent consultation lines, platform-fee note). `?state=joinable|away|empty` reaches every dashboard state. Data in `src/mocks/doctor.ts` behind `src/lib/data/doctor.ts`; Zod rules in `src/lib/schemas/doctor.ts`. Skills: `ui-ux-pro-max` and `frontend-design` used. Inspired by the doctor-mobile dashboard reference (availability card, two tiles, next consultation, queue) and Hummingbird. Reused from ViniCare (`src/app/doctor/{dashboard,calendar,earnings,patients}/page.jsx`): availability toggle, schedule, earnings and patient list panels. Changed: assigned-patients-only wording, hours and time-off rules instead of free time inputs, payout statuses, allergy warning in the queue. Found and fixed: earnings table pushed the page 283px wide at 375px | lint pass, types pass, build pass, axe 0 violations on 12 page states and the time-off and patient dialogs at 375/768/1024/1440, no sideways scroll, browser run of: availability toggle both ways, joinable start link, away and empty states, hours validation (end before start, under 30 min), time-off validation then add, patient search and summary. Mobile 375px layout checked against the reference | 71edb8b |
| 2026-10-02 | F-13 | Patient account pages: `/patient/profile` (your details, emergency contact, family members and children with add, edit and remove), `/patient/medical-history` (conditions and allergies as accessible tag lists, medicines with dose), `/patient/health` (vitals log with ranges and a readings table; added because the nav links to it), `/patient/settings` (consents with withdraw, where you are signed in with sign-out per device and for all others, download my data, delete my account with a typed confirmation and a cancel-deletion window), `/patient/referral` (invite link, copy with fallback, WhatsApp share, people invited). Zod schemas in `src/lib/schemas/profile.ts`; data in `src/mocks/profile.ts` behind `src/lib/data/profile.ts`. No address, Aadhaar or PAN collected. Skills: `ui-ux-pro-max` (forms, error summary, confirmation dialogs) and `frontend-design` used. Reused from ViniCare (`src/app/patient/{profile,medical-history,health,referral}/page.jsx`): conditions, allergies, medicines, the vitals fields and referral code idea. Changed: dropped address and “name as on ID”, added family and child handling, consent withdrawal, session management, export and deletion. Found and fixed: vitals table pushed the page 283px wide at 375px, the scrolling table was not keyboard reachable | lint pass, types pass, build pass, axe 0 violations on all 5 pages and on the family, withdraw-consent and delete dialogs at 375/768/1024/1440, no sideways scroll, browser run of: field validation with linked error summaries, failed save then saved, family add, edit and remove, duplicate and invalid tags, medicine add, vitals range and pair rules, optional and required consent, sign-out of one and all devices, data request, delete with wrong then right phrase then cancel, copy-link fallback | 6b2a178 |
| 2026-10-02 | F-12 | Health records vault `/patient/records` (images grid and documents list, type chips with counts, search, all in the URL; per file: view, download, share with a doctor for a chosen time, stop sharing, delete with soft-delete notice; statuses uploading, scanning, ready, rejected all shown; empty, error, loading) and `/patient/records/injury-photo` (take photo or choose from gallery, preview, quality hint worked out in the browser from size and brightness, retake, crop, rotate, doctor, optional note, privacy line, upload with progress and scan stages, sent and rejected results). Add-a-record sheet validates type and size (10 MB) and shows upload then scan progress. Data in `src/mocks/records.ts` behind `src/lib/data/records.ts`; placeholders instead of real photos. Skills: `ui-ux-pro-max` and `frontend-design` used. Inspired by the injury-photo and patient-files references. Reused from ViniCare (`src/app/patient/records/page.jsx`): file types PDF/JPG/PNG/WebP, 10 MB limit, optional label. Changed: record types, sharing with consent and expiry, scan states, soft delete, injury flow. Found and fixed: filter chips made the page 696px wide at 375px | lint pass, types pass, build pass, axe 0 violations on vault (filters, empty, error, no results), injury flow, and the view, share and upload dialogs at 375/768/1024/1440, no sideways scroll, browser run of: filters and search, junk URL values, view, download, share validation then success, stop sharing, delete, upload validation (bad type, empty fields), upload success, virus-named file rejected, injury flow with real image files (good, dark, small), rotate, crop, retake, send | 4efebcb |
| 2026-10-02 | F-11 | Patient dashboard `/patient/dashboard` (next-consultation card with live countdown and a join button that opens 10 minutes before, quick actions, follow-ups you can book, upcoming and recent lists) and `/patient/appointments` (Upcoming, Past, Cancelled lists with counts, cards by status, cancel dialog with reasons and a refund preview, reschedule dialog that offers the doctor's real free slots and handles “time taken”, rate dialog, refund status lines, late-change rules inside 2 hours, empty, loading and error states). `?state=empty|joinable|error` reaches every state. Follow-up link now enables the follow-up price on `/book/[id]?type=followup`. Data in `src/mocks/appointments.ts` behind `src/lib/data/appointments.ts`. Skills: `ui-ux-pro-max` (confirmation dialogs, focus management) and `frontend-design` (one strong card, quiet rest) used. Reused from ViniCare (`src/app/patient/appointments/page.jsx`, `dashboard/page.jsx`): statuses, the four tabs, cancel needing a reason, rate after completion, view prescription. Changed: reschedule picks real slots instead of free date and time inputs, adds no-show and doctor-cancelled states, refund status, late-change rule, follow-up offer. Found and fixed: tab list pushed the page 30px wide at 375px, focus fell to the body after a cancel | lint pass, types pass, build pass, axe 0 violations on dashboard (3 states) and appointments (all tabs, empty, error) at 375/768/1024/1440, no sideways scroll, dialogs checked after their animation, browser run of: late and free cancel, reason validation, failed cancel, toast, reschedule with taken slot then success, rating validation, Escape returns focus, bogus tab ignored | e749d1c |
| 2026-10-02 | F-10 | Content pages: `/blog` (category links, junk category ignored) and `/blog/[slug]` (6 sample articles, each with a medical reviewer and registration number, emergency note), `/faq` (5 groups, search by GET form, topic jump links, accordion on `<details>`, empty state), `/stories`, `/support` (contact form with Zod, focusable error summary, failed-send state that keeps the text, ticket reference, emergency and grievance side panel, “no medical details here” notice), `/about`. Content in `src/mocks/content.ts` behind `src/lib/data/articles.ts` and `support.ts`; footer gained About and Patient stories. Skills: `ui-ux-pro-max` (FAQ landing pattern: categories, accordion, contact CTA; keyboard navigation) and `frontend-design` used. Checked ViniCare: reference not available in the cloud, nothing consulted | lint pass, types pass, build pass, axe 0 violations and no sideways scroll on all 9 page states at 375/768/1024/1440, FAQ opens with Enter and closes with Space, FAQ search and empty state, support form summary focus then failed then sent, unknown article returns 404, every footer link now returns 200 | e3a88e0 |
| 2026-10-02 | F-09 | Eight public pages: `/how-it-works` (5 steps, when online care fits and when to go in person or call 112), `/specialties` (12 with sample doctor counts), `/doctor-verification`, `/patient-rights`, `/privacy-policy`, `/terms`, `/cookie-policy`, `/grievance`. Legal text is placeholder in `src/content/legal.ts` and `src/content/pages.ts`, served through `src/lib/data/content.ts`, with unknown facts in [square brackets]. A “Draft, pending legal review” banner shows on every legal page (remove at P9-10). Footer grievance link now points to `/grievance`. Skills: `ui-ux-pro-max` (searches for long-form layout returned nothing specific, so Quick Reference rules were used: 65 to 75 characters per line, sequential headings, anchor offset) and `frontend-design` used. Checked ViniCare: reference not available in the cloud, nothing consulted | lint pass, types pass, build pass, axe 0 violations and no sideways scroll on all 8 pages at 375/768/1024/1440, one h1 per page, table-of-contents anchor lands below the sticky header, footer links all resolve except `/blog`, `/faq`, `/support` (F-10) | 4557062 |
| 2026-10-02 | F-08 | Booking flow `/book/[id]?slot=`: 3 steps (time and consultation type, who and why with consent, review and pay), IST slot picker with day and time radios, family member or someone else (minor note), reason with quick chips, 10-minute hold timer (announced at 2 min, 1 min, 30 s), Razorpay-style checkout sheet that never asks for card or bank details (only a UPI id; card and net banking say Razorpay's page is used), outcome screens: success, failed (declined, bank unavailable), pending (“do not pay again”), slot taken, hold expired. Mock rules in `src/mocks/booking.ts` behind `src/lib/data/booking.ts`; the amount comes from the doctor record, never from the form. A slot id from the URL is accepted only if it belongs to that doctor. Skills: `ui-ux-pro-max` (multi-step progress, error summary, payment guidance) and `frontend-design` used. Found and fixed: invalid definition-list markup (axe). Checked ViniCare: reference not available in the cloud, nothing consulted | lint pass, types pass, build pass, axe 0 violations on all 3 steps, error state, checkout, failed, pending and success at 375px and step 1 at all four widths, no sideways scroll, browser run of every step, validation errors with focused summary, change links, failed then retry then success, pending, taken, hold expiry with a fake clock | bb2ee8a |
| 2026-10-02 | F-07 | Doctor directory `/doctors` (search, specialty, language, fee cap, available today, sort from an allow-list, removable filter chips, page links, empty state) and profile `/doctors/[id]` (registration number and council, qualifications, languages, reviews, fees, next slots in IST, booking card). Filters are a plain GET form so the URL holds all state and bad values are dropped by `src/lib/schemas/doctors.ts`. 14 mock doctors in `src/mocks/doctors.ts` behind `src/lib/data/doctors.ts`; Home featured doctors now come from the same source. Skills: `ui-ux-pro-max` (no-results and filter guidance) and `frontend-design` used. Inspired by Doccure cards and ViniCare `/doctors`. Found and fixed: symptom words like “skin” matched nothing. Checked ViniCare: reference not available in the cloud, nothing consulted | lint pass, types pass, build pass, axe 0 violations on directory, profile and empty state at 375/768/1024/1440, no sideways scroll, browser run of every filter, combined filters, page 2, chip removal, mobile filter toggle, junk query values return 200 and profile of unknown id returns 404 | 691b897 |
| 2026-10-02 | F-06 | Auth pages: `/login` and `/register` (patient phone, OTP with 30 s resend timer, attempt limit, expired and locked states, consent line), `/login/staff` (email and password, TOTP, backup code, lockout), `/forgot-password`, `/reset-password` (`?state=expired` shows the dead-link state), `/change-password`, `/for-doctors` (application entry). Zod schemas in `src/lib/schemas/auth.ts`, mock rules in `src/mocks/auth.ts` behind `src/lib/data/auth.ts`, focusable error summary, show-password button, paste and password managers allowed, a labelled “Prototype only” box lists the fake codes. Replies never say whether an account exists. Skills: `ui-ux-pro-max` (searches: accessible authentication, error summary) and `frontend-design` used, both loaded through the Skill tool. Found and fixed: labels not tied to inputs when a fixed id was used (axe), focus not moved to the code boxes after a step change or wrong code. Checked ViniCare: reference repo not available in the cloud, nothing consulted. Added `zod` 4.6.5 (client validation required by the F rules, same schemas reused on the server later) | lint pass, types pass, build pass (14 routes), axe 0 violations on all 8 pages and on OTP and error states at 375px, no sideways scroll at 375/768/1024/1440, keyboard-only run through patient success, wrong, expired, locked, rate limited, staff invalid, backup code, locked, forgot, change-password summary | 8864207 |
| 2026-10-02 | F-05 | Home page: hero with doctor and specialty search (plain GET form to `/doctors`), sample consultation preview, trust strip, 12 specialties, how it works, 4 featured doctors with registration numbers, consultation types in the dark band, patient stories, benefits, FAQ teaser, final call to action. Data through `src/lib/data/home.ts`, mocks in `src/mocks/home.ts`. Skills: `ui-ux-pro-max` (landing pattern search: marketplace/directory, SKILL.md checklist) and `frontend-design` (plan, avoid generic tells: no caps eyebrows, no accent word) read from `.claude/skills/` because the Skill tool could not load them in a session that started before they were added. Inspired by Med24 (dark services band, stats idea) and Doccure (search, category tiles). Checked ViniCare: reference repo is private and could not be cloned in the cloud, nothing consulted | lint pass, types pass, build pass, axe 0 violations and no sideways scroll at 375/768/1024/1440, screenshots reviewed at 375 and 1440. Lighthouse not run (no tool in the cloud), axe used instead | 6146fab |
| 2026-10-02 | F-04 | Public header (full nav from 1280px, menu sheet below), footer with emergency notice (112), dashboard shell (sidebar, top bar, native-popover bell and account menu, 4 tabs plus More sheet on phones, focus moves to main on page change), breadcrumbs, page header, mock session through `src/lib/data/session.ts`, role layouts and one stub dashboard per role. Found and fixed: header wrapped at 1024px, footer cramped, empty state heading level skipped. Checked ViniCare: panel routes used for the navigation lists | lint pass, types pass, format pass, build pass (7 routes), axe 0 violations on `/` and all four panels at 375px, popover Escape and focus return, skip link visible on focus, no sideways scroll | 1b5310f |
| 2026-10-02 | F-03 | Design tokens in `globals.css` (all 22 contrast pairs pass, one fixed), 20 primitives in `src/components/ui/` (button, field, choice, OTP, card, stat tile, badge, avatar, tabs, accordion, dialog and sheet, toast, tooltip, skeleton, table, pagination, empty state, stepper, logo), dev-only `/design` page. Found and fixed: tab bar stray scrollbar, OTP autofill truncation. Checked ViniCare: nothing relevant | lint pass, types pass, format pass, build pass, axe 0 violations on `/design`, keyboard checks for dialog, tabs and OTP, no sideways scroll at 375px, `/design` returns 404 in production | 5f23f40 |
| 2026-10-02 | F-02 | Scaffolded Next.js 16.3.8, TS strict, Tailwind 4, App Router in `src/`, fonts via `next/font`, ESLint (no-danger, no-any), Prettier, `.gitignore` (env files excluded), `.nvmrc`, `.env.example`, dev launch config. Covers P0-02, P0-03, P0-04. Checked ViniCare: nothing relevant | lint pass, types pass, format pass, build pass (`/` static) | d705c39 |
| 2026-10-02 | F-01 | Wrote `docs/design-notes.md`: palette, type, spacing, components, screen inventory with a reference for every screen. Checked ViniCare: route map and home sections used as the panel list | n/a (docs) | d705c39 |
| 2026-10-02 | Planning | Added Phase F (23 frontend tasks, mock data first), decisions D-007 to D-009, updated Dashboard and Current focus. Reviewed 12 inspiration screens and the ViniCare route map (Checked ViniCare: patient, doctor, admin pages listed) | n/a | n/a |
| 2026-10-02 | Planning | Adapted paths to the real folder layout (`ViniCure_Project`), added `../Frontend_Inspirations`, P0-16, rewrote P0-01 and P0-15 | n/a | n/a |
| 2026-10-02 | Planning | Added project-context and when-to-consult-ViniCare rules to CLAUDE.md, task P0-15, `.claude/settings.json`, `/port` command | n/a | n/a |
| 2026-10-02 | Planning | Merged ideas from the old MASTER_TODO.md: added P2-16, P4-10, P9-13, sharpened acceptance criteria on 13 tasks, flagged the retention conflict | n/a | n/a |
| 2026-10-02 | Planning | Merged rules from the old ViniCare CLAUDE.md into CLAUDE.md. Added tasks P1-21, P2-14, P2-15, P6-11, P9-12, SEC tags, DISCOVERED section | n/a | n/a |
| 2026-10-02 | Planning | Created architecture, backend, ER model, TODO and CLAUDE.md | n/a | n/a |
