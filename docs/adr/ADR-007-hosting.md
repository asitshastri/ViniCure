# ADR-007: Hosting

Status: accepted (2026-10-02, human).

## Decision

AWS Mumbai with Hyderabad backups, ECS Fargate.

## Context

Decision D-005. Primary region `ap-south-1` (Mumbai); backups and snapshot copies in `ap-south-2` (Hyderabad). Infrastructure is written in Terraform in Phase 3.

## Revisit when

20+ services or an in-house Kubernetes team.

## Consequences and open points

- Written from the decision table in `docs/architecture.md` section 13 (task P0-12). Add the options that were rejected and the measurements that support the decision when this topic is worked on.
