-- The worker and the web app connect as `app`. They may use the pg-boss tables and functions
-- but not change the schema. Queues are created by the migrator (see src/lib/queue).
GRANT USAGE ON SCHEMA pgboss TO app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT USAGE, SELECT ON SEQUENCES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
