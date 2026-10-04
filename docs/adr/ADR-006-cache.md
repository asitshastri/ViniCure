# ADR-006: Cache

Status: accepted (2026-10-02, human).

## Decision

Valkey.

## Context

Valkey holds short-lived state only (rate-limit counters, idempotency records, caches), never patient data. Sensitive rate-limit tiers fail closed if it is down (D-006).

## Revisit when

Cost or private networking needs change.

## Consequences and open points

- Written from the decision table in `docs/architecture.md` section 13 (task P0-12). Add the options that were rejected and the measurements that support the decision when this topic is worked on.
