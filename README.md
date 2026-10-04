# ViniCure

A telemedicine website for India: patients find a doctor, book, pay, and talk by video; doctors write prescriptions; admins and support run the service. It handles very sensitive health data, so security and privacy come before everything else (see `CLAUDE.md`).

This repository is a ground-up rewrite of ViniCare in TypeScript with PostgreSQL, Docker and a background worker, hosted on AWS in Mumbai.

## Where things are

| Path                      | What                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/app`                 | The website and the API routes (Next.js App Router)                                                     |
| `src/modules`             | Business modules: identity (sign-in, sessions, policies), patients, compliance                          |
| `src/lib`                 | Shared building blocks: config, database, cache, queue, rate limits, errors, adapters for third parties |
| `db/migrations`           | Numbered SQL files; the schema's source of truth                                                        |
| `worker` and `src/worker` | The background job process                                                                              |
| `e2e`                     | Browser tests (Playwright)                                                                              |
| `docs`                    | Architecture, API, data model, decision records (`docs/adr`), runbooks                                  |
| `TODO.md`                 | The single backlog, decisions log and progress log                                                      |

## Run it on your computer

You need Node 24, pnpm (through corepack) and Docker.

```bash
corepack enable
pnpm install
docker compose -f docker/compose.yml up -d      # Postgres, Valkey, Mailpit, S3 test server, ClamAV
cp .env.example .env.local                      # then fill in the values (see docker/README.md)
pnpm db:migrate
pnpm dev                                        # http://localhost:3000
```

The local settings in `.env.local` (a secret for sessions, a key for encryption, the storage and virus-scanner addresses) are throwaway values made on your own computer. Real provider keys (Agora, Razorpay) are added there by you and never go in the repository.

### Test accounts to try every screen

```bash
pnpm db:seed --demo --accounts   # demo doctors, test accounts and a few paid bookings (local computer only)
pnpm dev                         # the website, http://localhost:3000
pnpm worker                      # the background jobs (invoices, file scans, reminders)
```

| Who                                                                                                                      | How to sign in                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Patients **6000000001**, **6000000002**, **6000000003**                                                                  | /login. The one-time code is printed in the terminal that runs `pnpm dev` (a line starting `[dev sms]`, local only)                           |
| Admin `admin@vinicure.test`, support `support@vinicure.test`, doctors `doctor1@vinicure.test` to `doctor3@vinicure.test` | /login/staff. The password is `DEV_PASSWORD` in `src/db/seed-accounts.mts`. The authenticator code: `pnpm dev:code admin` (or `doctor1`, ...) |

Patient 6000000001 has three paid bookings with doctor 1's demo profile: one that opens for joining right now, one tomorrow and one finished. Running the seed again puts the test patients back to "never signed in", so their next sign-in is trusted at once. The authenticator secrets are kept in `.dev-accounts.json`, which git ignores.

, put `UI_MOCK_SESSION=true` in `.env.local` (development only; production refuses it).

## Check your work

```bash
pnpm lint && pnpm typecheck && pnpm format:check
pnpm test        # with DATABASE_TEST_URL and VALKEY_TEST_URL set, the real-database tests run too (docker/README.md)
pnpm e2e         # starts the site on port 3100 and drives a real browser
pnpm build
```

In a cloud session without Docker, `bash docker/cloud-services.sh` starts Postgres and Valkey.

A commit runs a secret scan and the linters on the changed files (husky and lint-staged). GitHub Actions runs everything above, a dependency audit, a secret scan of the whole history, and builds and scans the container images.

## Licence

Not chosen yet. Until the owner picks one, all rights are reserved.
