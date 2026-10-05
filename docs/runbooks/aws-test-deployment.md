# Runbook: the test site on AWS (Mumbai)

A private test of the real production build, on one small server in Mumbai. Real settings, real
encryption keys, real storage, real SMS and email. It is meant for dummy data and a few testers.
The full launch setup (ECS, RDS, WAF, two regions) is Phase 3 and is not replaced by this.

Files: `deploy/aws/test-stack.yaml` (the AWS parts), `deploy/compose.yml` (the containers),
`deploy/Caddyfile`, `deploy/scripts/deploy.sh`, `deploy/scripts/backup.sh`.

## 1. Where is the data stored?

Today, on your own computer: Docker keeps the database and files in Docker volumes (`pgdata`,
`s3data`) on your disk. Nothing is online.

On the AWS test site, everything we store is in **Mumbai (`ap-south-1`)**:

| What | Where | Protection |
|---|---|---|
| The database (accounts, bookings, notes, prescriptions, records) | PostgreSQL in a container, its files on the server's encrypted disk (EBS) in Mumbai | Disk encryption; free-text clinical fields are encrypted again by the app with a KMS-wrapped key; no port open to the internet; daily disk snapshots (kept 7 days) and a nightly dump to a private bucket |
| Uploaded files (reports, scans, KYC), invoices, exports | S3 buckets in Mumbai | Private, encrypted, versioned, HTTPS only, reachable only by short-lived signed links |
| Recordings (when switched on) | Their own S3 bucket in Mumbai | Same, and off by default |
| Encryption keys | KMS in Mumbai; the app keeps only wrapped copies in Parameter Store | The key never leaves KMS; only the server's role may use it |
| Settings and secrets | Parameter Store in Mumbai (secrets as SecureString) | Not in the repository, not in logs |
| Logs | The server's disk | Hold no patient data or secrets by design |

Other companies see only what they must: **Agora** relays the call media (its data centre is set to
Asia-Pacific; it does not keep the stream); **MSG91** sees the phone number and the one-time code
in transit; the **mail server** sees the staff email address and the link; **Google** sees the
sign-in; **Razorpay** (later) handles payment details, which we never store; **GitHub** holds the code only.

The launch plan adds a copy in Hyderabad (`ap-south-2`) for disaster recovery. The test site does not.

## 2. Cost and credits

Rough, from memory, check the AWS calculator: server (4 GB) about $33 a month when left on, disk
$3, public address $4, KMS $1, the rest cents. About $40 to 45 a month, less if you stop the server
when nobody is testing (a stopped server costs only its disk). New accounts have received up to $200
of credit (6 months on the free plan); check the offer when you sign up. The stack creates a **budget
alert** that emails you at 80 percent of the monthly limit you set.

## 3. The Postgres connection plan

- **Two logins, as designed.** `migrator` owns the database and runs migrations only (the one-off
  `migrate` container). `app` reads and writes data and cannot change the schema (the website and the
  worker). The website and worker never receive the migrator's or the administrator's password:
  they read `/opt/vinicure/app.env`; only `docker compose` reads `compose.env`.
- **Network.** The database publishes no port. Only containers on the server's private Docker network
  can reach it, by the name `postgres`. The firewall opens only 80 and 443. There is no SSH: you get a
  shell through AWS Session Manager, which needs no open port and is logged.
- **Passwords.** Random, 48 letters and digits, made by `deploy.sh` on first run and kept in Parameter
  Store as SecureString. They are not in the repository and not printed.
- **Pool sizes.** The website opens up to `DATABASE_POOL_MAX` (default 10) connections, the worker a
  smaller shared pool, the queue library its own small pools, the migrator one. The database allows 60.
  That leaves room for a second website container and for you to look. No connection pooler is needed
  at this size; add PgBouncer only when measurements show the limit.
- **TLS inside the box.** Traffic between containers on one machine stays on the machine, so no
  database TLS here. When the database moves to RDS at launch, the connection string gets
  `sslmode=verify-full` with Amazon's certificate bundle, and the same two roles are created there.
- **Backups.** A nightly `pg_dump` (compressed) streams to the private backup bucket (35 days) and AWS
  snapshots the disk daily (7 days). **Restore drill (do it once):** download a dump, start a throwaway
  Postgres container, `pg_restore` into it, and check that the bookings table has rows. A backup that
  was never restored is a hope, not a backup.
- **Looking at the data.** Use `docker compose exec postgres psql -U postgres vinicure` in a Session
  Manager shell. Do not open the database to the internet to use a desktop tool.

### Connecting a database tool or an AI assistant (MCP)

- Use a **separate read-only role** made for the purpose, never `app`, `migrator` or `postgres`.
- Connect it **only to a database that holds dummy data**. A tool that reads the database sends rows to
  whoever runs the tool, and with an AI assistant that means the rows are read by the model. That must
  never happen with real patient data.
- For AWS, give the assistant an IAM user or role with **only what it needs** (this stack, S3, Session
  Manager) and a budget alert in place, not administrator access. Remove it when the work is done.

## 4. What I need from you, in order

1. **AWS account** (free plan or paid), with MFA on the root user. Create an IAM user or role for me
   with limited permissions (see above) if you want me to run the steps.
2. **A GitHub token** so the server can download the code: GitHub, Settings, Developer settings,
   Fine-grained tokens, repository `ViniCure` only, permission Contents: Read-only, 90 days.
3. **hCaptcha** free account (site key and secret). Without it the server refuses to send sign-in
   codes in production. The sign-in widget is not built yet (see "Before real sign-in works").
4. Your **MSG91** key and OTP template id, and **email** settings (Gmail app password for the test, or
   SES later).
5. Your **Agora** App ID and certificate (already working locally).
6. Optional: a **domain**. Not needed for the first test (section 6).

## 5. Launching the stack

1. AWS console, make sure the region (top right) is **Asia Pacific (Mumbai)**.
2. CloudFormation, Create stack, With new resources, upload `deploy/aws/test-stack.yaml`.
3. Fill in the parameters: your email for the budget alert, the monthly limit, the repository, and
   leave the rest. Accept the IAM capability box. Create. It takes about 5 minutes.
4. Outputs tab: note the **InstanceId** and the **PublicIp**.
5. Systems Manager, Parameter Store: create the settings of section 7 (the stack already made the
   bucket, key and region ones).

To remove everything: delete the stack. The buckets, the key and the backup bucket are **kept**
on purpose (data safety); delete them by hand when you are sure.

## 6. HTTPS with no domain (CloudFront)

The production build needs an `https://` address. Without a domain, put CloudFront in front: CloudFront
console, Create distribution, origin domain = the server's public DNS name (EC2 console, instance
details), origin protocol **HTTP only**, viewer protocol **Redirect HTTP to HTTPS**, caching **disabled**
(`CachingDisabled`), origin request policy **AllViewer**. You get an address like
`https://d1234abcd.cloudfront.net`. Set the settings `APP_URL` to that address and `TRUSTED_PROXY_HOPS`
to `2`. The hop from CloudFront to the server is unencrypted inside AWS: acceptable for dummy data,
not for launch (the launch plan uses an ALB with a certificate). **This route is not yet tried end to
end.**

With a domain instead: point its A record at the server's address, set `SITE_ADDRESS` to the domain
(Caddy then gets its own certificate) and `APP_URL` to `https://<domain>`.

## 7. Settings (Parameter Store, path `/vinicure/test/`)

The name is the environment variable name. **SecureString** for anything secret.

| Name | Type | Notes |
|---|---|---|
| `GITHUB_TOKEN` | SecureString | Read-only token (section 4). Not given to the containers. |
| `APP_URL` | String | The public address, `https://...`. Required. |
| `SITE_ADDRESS` | String | Optional. A domain for automatic HTTPS; empty means plain port 80. |
| `TRUSTED_PROXY_HOPS` | String | `1` with a domain, `2` behind CloudFront. |
| `MSG91_AUTH_KEY` | SecureString | |
| `MSG91_TEMPLATE_OTP` | String | The DLT template id of the OTP message (its variable is `otp`). |
| `MSG91_SENDER_ID` | String | Only if the flow does not fix the sender. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `EMAIL_FROM` | String | Gmail: `smtp.gmail.com`, `465`, `true`. |
| `SMTP_PASSWORD` | SecureString | A Gmail app password. |
| `AGORA_APP_ID` | String | |
| `AGORA_APP_CERTIFICATE` | SecureString | |
| `GOOGLE_CLIENT_ID` | String | Add the site's redirect address in Google Cloud first. |
| `GOOGLE_CLIENT_SECRET` | SecureString | |
| `HCAPTCHA_SITE_KEY` | String | |
| `HCAPTCHA_SECRET` | SecureString | |

Made by `deploy.sh` itself, no action: `AUTH_SECRET`, the database and cache passwords,
`KMS_WRAPPED_KEYS` and `KMS_CURRENT_KEY_ID` (the data key is made by KMS and only its wrapped form is
stored). Not set yet, on purpose: the Razorpay keys (payments come later; the site tells the patient
payment is unavailable), `RECORDING_RETENTION_DAYS`.

## 8. First deployment

In the EC2 console choose the instance, Connect, **Session Manager**. Then:

```bash
sudo /opt/vinicure/clone.sh                                  # downloads the code (once)
sudo bash /opt/vinicure/app/deploy/scripts/deploy.sh         # builds, migrates, starts, backs up once
```

The first run takes 10 to 15 minutes (the image build, and ClamAV downloading its virus signatures).
It ends with "the site is up".

Then make **the first administrator** (once; it refuses if an admin already exists):

```bash
cd /opt/vinicure/app
sudo docker compose --env-file /opt/vinicure/compose.env -f deploy/compose.yml exec worker node first-admin.mjs you@example.com
```

It prints a link. Open it in your browser, choose a password and scan the authenticator code. From the
admin screens you can then invite doctors and support staff (the email goes through SMTP).

The demo accounts and demo doctors of your own computer are not made here: that script refuses any
site that is not local. The test site starts empty; add doctors by invitation and sign patients in
with real numbers.

## 9. Everyday

| Task | How |
|---|---|
| Update to the newest code | `sudo bash /opt/vinicure/app/deploy/scripts/deploy.sh` |
| See logs | `sudo docker compose --env-file /opt/vinicure/compose.env -f /opt/vinicure/app/deploy/compose.yml logs --tail 100 web` |
| Status | the same with `ps` |
| Save money | EC2 console, Stop instance. Start it again later; the containers come back by themselves. The public address stays. |
| Backup now | `sudo bash /opt/vinicure/app/deploy/scripts/backup.sh` |

## 10. Compromises that exist only because this is a test

| Compromise | Why | Launch fix |
|---|---|---|
| One server runs everything | Cheap and simple | ECS services, RDS Multi-AZ, ElastiCache |
| Containers can use the server's AWS role | One machine has one role | Each service gets its own task role |
| The role can read all test settings | Same | Each service reads only its own secrets |
| CloudFront to the server over HTTP (no domain) | No certificate without a domain | ALB with an ACM certificate |
| No WAF | Cost | WAF managed and rate rules |
| Copies only in Mumbai | Cost | Snapshots and replicas in Hyderabad |
| Secrets written to files on the server | Simple | Injected by the task definition |

## Open items before the test site can be used

1. **Sign-in needs the hCaptcha widget** on the patient login form (DISCOVERED in TODO.md). Until it is
   built, production refuses to send sign-in codes.
2. ~~The first admin~~ is done: `first-admin.mjs` (section 8).
3. **CloudFront with no domain** is untried.
4. **The templates** for email are placeholders and the SMS wording is whatever is approved on DLT.
5. **The stack file has been syntax-checked but not yet run on AWS.** The first run may need small fixes.
