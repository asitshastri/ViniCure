#!/bin/sh
# Runs once, when the database folder is first created. Makes the two roles the app uses, with
# passwords from the environment (made by deploy.sh, random, letters and digits only):
#   migrator  owns the database and the schema; used only by the one-off migrate container
#   app       reads and writes data but cannot change the schema; used by the website and worker
# db/migrations/0001_baseline.sql sets what each may do.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE migrator LOGIN PASSWORD '${MIGRATOR_DB_PASSWORD}';
CREATE ROLE app LOGIN PASSWORD '${APP_DB_PASSWORD}';
ALTER DATABASE ${POSTGRES_DB} OWNER TO migrator;
\connect ${POSTGRES_DB}
ALTER SCHEMA public OWNER TO migrator;
SQL
