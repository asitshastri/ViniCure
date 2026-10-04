# ADR-002: Database

Status: accepted (2026-10-02, human).

## Decision

PostgreSQL, SQL migrations as source of truth.

## Context

Decision D-002. Numbered SQL files in `db/migrations` are the source of truth for the schema; they are applied by `pnpm db:migrate` (checksums, advisory lock, one transaction per file).

## Revisit when

Never expected.

## Consequences and open points

- Written from the decision table in `docs/architecture.md` section 13 (task P0-12). Add the options that were rejected and the measurements that support the decision when this topic is worked on.
