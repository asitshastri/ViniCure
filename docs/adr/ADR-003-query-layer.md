# ADR-003: Query layer

Status: accepted (2026-10-02, human).

## Decision

Drizzle with raw SQL where needed.

## Context

Decision D-018. Drizzle is used for typed queries only; `drizzle-kit` is not used. Only `repo.ts` files query the database, with explicit column lists.

## Revisit when

Drizzle 1.0 stability issues.

## Consequences and open points

- Written from the decision table in `docs/architecture.md` section 13 (task P0-12). Add the options that were rejected and the measurements that support the decision when this topic is worked on.
