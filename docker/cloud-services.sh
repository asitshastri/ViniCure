#!/usr/bin/env bash
# Cloud sessions have no Docker daemon, but Postgres 16 and redis-server are installed. This
# starts them, creates the app and migrator roles, applies the migrations and prints the test
# environment. Run as root in a cloud session:  bash docker/cloud-services.sh
# Not for production or for a local PC (use docker compose there).
set -euo pipefail
D=/var/lib/pgtest
PGBIN=/usr/lib/postgresql/16/bin
if [ ! -d "$D/data" ]; then
  mkdir -p "$D" && chown postgres "$D"
  su postgres -c "$PGBIN/initdb -D $D/data -A trust -U postgres >/dev/null"
fi
su postgres -c "$PGBIN/pg_ctl -D $D/data -o '-p 5432 -k /tmp' -l $D/log -w start" || true
psql -h /tmp -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='vinicure'" | grep -q 1 || {
  psql -h /tmp -U postgres -c "CREATE DATABASE vinicure"
  psql -h /tmp -U postgres -d postgres -f "$(dirname "$0")/postgres-init/01-roles.sql"
}
redis-cli ping >/dev/null 2>&1 || redis-server --port 6379 --daemonize yes >/dev/null
DATABASE_MIGRATION_URL=postgres://migrator:dev-only-change-me@localhost:5432/vinicure npx pnpm@12.8.1 db:migrate
cat <<'ENV'

Run the full suite including the integration tests:
VALKEY_TEST_URL=redis://localhost:6379 \
DATABASE_TEST_URL=postgres://app:dev-only-change-me@localhost:5432/vinicure \
npx pnpm@12.8.1 test
ENV
