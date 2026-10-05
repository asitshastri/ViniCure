# ADR-007: Hosting

Status: accepted (2026-10-02, human).

## Decision

AWS Mumbai with Hyderabad backups, ECS Fargate.

## Context

Decision D-005. Primary region `ap-south-1` (Mumbai); backups and snapshot copies in `ap-south-2` (Hyderabad). Infrastructure is written in Terraform in Phase 3.

## Amendment (2026-10-05, D-024): the test site

Before the full Terraform setup exists, a private test site runs the same production build on **one
server in Mumbai** (EC2 with Docker Compose), with KMS, S3, SES or SMTP and Parameter Store, built from
`deploy/aws/test-stack.yaml`. It is the stepping stone, not the end: it shares one role between all
containers and has no WAF or second region. The compromises and the launch fix for each are listed in
`docs/runbooks/aws-test-deployment.md`. Moving to ECS, RDS and ElastiCache at launch keeps the same
settings names, the same two database roles and the same KMS data keys.

## Revisit when

20+ services or an in-house Kubernetes team.

## Consequences and open points

- Written from the decision table in `docs/architecture.md` section 13 (task P0-12). Add the options that were rejected and the measurements that support the decision when this topic is worked on.
