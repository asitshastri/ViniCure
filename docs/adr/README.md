# Architecture decision records

Each ADR records one decision, why, and when to revisit it. Copy `0000-template.md` for a new one. ADR-004 is the only long one so far; the others were written from the decision table in `docs/architecture.md` section 13 and grow when their topic is worked.

| ADR | Topic | Decision | Revisit when |
|---|---|---|---|
| [ADR-001](ADR-001-application-shape.md) | Application shape | Modular monolith, Next.js plus worker from one image | Teams need independent deploys |
| [ADR-002](ADR-002-database.md) | Database | PostgreSQL, SQL migrations as source of truth | Never expected |
| [ADR-003](ADR-003-query-layer.md) | Query layer | Drizzle with raw SQL where needed | Drizzle 1.0 stability issues |
| [ADR-004](ADR-004-authentication.md) | Authentication | Better Auth, self-hosted | Security review finds gaps, or a managed IdP is required |
| [ADR-005](ADR-005-queue.md) | Queue | pg-boss on Postgres | Job volume or latency needs a broker |
| [ADR-006](ADR-006-cache.md) | Cache | Valkey | Cost or private networking needs change |
| [ADR-007](ADR-007-hosting.md) | Hosting | AWS Mumbai with Hyderabad backups, ECS Fargate | 20+ services or an in-house Kubernetes team |
| [ADR-008](ADR-008-video.md) | Video | Agora behind an adapter | A pilot shows another provider is better |
| [ADR-009](ADR-009-email.md) | Email | SES Mumbai | Deliverability problems |
| [ADR-010](ADR-010-file-scanning.md) | File scanning | ClamAV | Need a managed scanner |
| [ADR-011](ADR-011-clinical-access.md) | Clinical access | Admin cannot read clinical content. Support uses break-glass. | Legal or operational need |
| [ADR-012](ADR-012-push-notifications.md) | Push notifications | Deferred | After launch |
