-- Local development only. Runs once, when the Postgres volume is first created.
-- Gives the two database roles a login and a throwaway password. In AWS, Terraform
-- creates these roles instead. db/migrations/0001_baseline.sql sets their privileges.
CREATE ROLE migrator LOGIN PASSWORD 'dev-only-change-me';
CREATE ROLE app LOGIN PASSWORD 'dev-only-change-me';

-- The migrator owns the database and the public schema, so it can run migrations.
ALTER DATABASE vinicure OWNER TO migrator;
\connect vinicure
ALTER SCHEMA public OWNER TO migrator;
