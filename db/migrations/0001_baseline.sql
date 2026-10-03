-- Baseline: extensions, database roles, privileges, and the updated_at trigger.
--
-- Roles (backend-architecture.md section 7):
--   migrator  owns the schema and runs migrations. Used only by the migrate step.
--   app       what the running application connects as. Data changes only, no DDL.
-- Both are created without a login here. The environment gives them a login and a
-- password: docker/postgres-init for local work, Terraform in AWS.

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'migrator') THEN
    CREATE ROLE migrator NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app NOLOGIN;
  END IF;
END
$$;

-- Nobody but the migrator can create objects.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO migrator;
GRANT USAGE ON SCHEMA public TO app;

-- Tables and sequences created by later migrations are usable by app for data changes.
-- Append-only tables take UPDATE and DELETE away again in their own migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app;
-- The same for objects created while connected as the migrator role itself.
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app;

-- The migration bookkeeping table is not for the application.
REVOKE ALL ON TABLE schema_migrations FROM app;

-- Keeps updated_at current. Attach with:
--   CREATE TRIGGER <table>_set_updated_at BEFORE UPDATE ON <table>
--   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

-- Used by append-only tables: any UPDATE, DELETE or TRUNCATE is refused, even for the owner.
CREATE FUNCTION forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END
$$;
