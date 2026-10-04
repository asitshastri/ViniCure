# ADR-001: Application shape

Status: accepted (2026-10-02, human).

## Decision

Modular monolith, Next.js plus worker from one image.

## Context

Decision D-001. Next.js serves the website and the API; the worker runs queued jobs; both are built from one repository and one Dockerfile with two targets (`web`, `worker`).

## Revisit when

Teams need independent deploys.

## Consequences and open points

- Written from the decision table in `docs/architecture.md` section 13 (task P0-12). Add the options that were rejected and the measurements that support the decision when this topic is worked on.
