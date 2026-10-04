# ADR-005: Queue

Status: accepted (2026-10-02, human).

## Decision

pg-boss on Postgres.

## Context

pg-boss keeps jobs in Postgres (schema `pgboss`), so there is no extra system to run. Queues, payloads (IDs only), retries and dead letters are listed in `src/lib/queue/registry.ts`.

## Revisit when

Job volume or latency needs a broker.

## Consequences and open points

- Written from the decision table in `docs/architecture.md` section 13 (task P0-12). Add the options that were rejected and the measurements that support the decision when this topic is worked on.
