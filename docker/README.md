# Local services

Start Postgres, Valkey, Mailpit, MinIO and ClamAV:

```bash
docker compose -f docker/compose.yml up -d
docker compose -f docker/compose.yml ps
```

| Service     | Address                                                | Used for                                                                             |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Postgres 17 | `localhost:5432`, user `vinicure`, database `vinicure` | Main database                                                                        |
| Valkey 8    | `localhost:6379`                                       | Rate limits, idempotency, short-lived state                                          |
| MinIO       | `localhost:9000` (API), `localhost:9001` (console)     | Fake S3. Buckets `vinicure-files` and `vinicure-exports` are created by `minio-init` |
| Mailpit     | `localhost:8025` (inbox), `localhost:1025` (SMTP)      | Catches outgoing email                                                               |
| ClamAV      | `localhost:3310`                                       | Virus scanning. The first start downloads signatures and takes a few minutes         |

All ports listen on this computer only. The passwords in `compose.yml` are throwaway values for local use and must never be reused anywhere else.

Stop everything: `docker compose -f docker/compose.yml down`. Add `-v` to also delete the data.

## Running the integration tests

```bash
VALKEY_TEST_URL=redis://localhost:6379 pnpm test
```

More variables (for example `MINIO_TEST_ENDPOINT`) are listed in the integration test files, which skip themselves when their variable is not set.
