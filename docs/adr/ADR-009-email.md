# ADR-009: Email

Status: accepted (2026-10-02, human).

## Decision

SES Mumbai.

## Context

Email goes through the `EmailProvider` adapter. SES in Mumbai needs a verified domain, SPF, DKIM and DMARC (P3-11).

## Revisit when

Deliverability problems.

## Consequences and open points

- Written from the decision table in `docs/architecture.md` section 13 (task P0-12). Add the options that were rejected and the measurements that support the decision when this topic is worked on.
