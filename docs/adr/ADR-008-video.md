# ADR-008: Video

Status: accepted (2026-10-02, human).

## Decision

Agora behind an adapter.

## Context

Video goes through the `VideoProvider` adapter (`src/lib/adapters/types.ts`) so the provider can change. P6-10 compares providers on Indian mobile networks and P6-11 records the media-encryption decision here.

## Revisit when

A pilot shows another provider is better.

## Consequences and open points

- Written from the decision table in `docs/architecture.md` section 13 (task P0-12). Add the options that were rejected and the measurements that support the decision when this topic is worked on.
