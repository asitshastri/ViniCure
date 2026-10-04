# ADR-011: Clinical access

Status: accepted (2026-10-02, human).

## Decision

Admin cannot read clinical content. Support uses break-glass..

## Context

Admins can read business data but never clinical content. Support reads clinical data only through break-glass (reason, time limit, alert, logged). Implemented in `src/modules/identity/policy.ts` and tested cell by cell.

## Revisit when

Legal or operational need.

## Consequences and open points

- Written from the decision table in `docs/architecture.md` section 13 (task P0-12). Add the options that were rejected and the measurements that support the decision when this topic is worked on.
