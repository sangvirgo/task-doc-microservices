# C17 — Task Assignment and Secure Digital Document Sharing Platform

An organizational platform where work is assigned as tasks, and access to confidential documents
is granted only for as long as the task that justifies it remains live.

Start with [CONTEXT.md](CONTEXT.md) for the domain language, then
[docs/planning/backend-implementation-plan.md](docs/planning/backend-implementation-plan.md) for the plan.
Decisions that outrank the plan live in [docs/adr/](docs/adr/).

## Layout

This is a **NestJS monorepo managed by pnpm** — not a pnpm workspace (V3 §4.1). There is exactly
one `package.json`, one `pnpm-lock.yaml`, and one `nest-cli.json`. Applications never get their
own `package.json`.

```
apps/    ten independently deployable services
libs/    shared libraries, consumed through @c17/* path aliases
infra/   Dockerfile and container init scripts
scripts/ build and smoke-test tooling
docs/    ADRs, evidence, reports
```

| Service                           | Port | Database                |
| --------------------------------- | ---- | ----------------------- |
| `api-gateway`                     | 3000 | —                       |
| `authentication-identity-service` | 3001 | `auth_db`               |
| `user-role-management-service`    | 3002 | `user_role_db`          |
| `task-management-service`         | 3003 | `task_db`               |
| `document-management-service`     | 3004 | `document_db`           |
| `document-security-service`       | 3005 | `document_security_db`  |
| `permission-service`              | 3006 | `permission_db`         |
| `audit-log-service`               | 3007 | `audit_db`              |
| `notification-service`            | 3008 | `notification_db`       |
| `security-monitoring-service`     | 3009 | `security_monitoring_db`|

No service reads another service's database (V3 §7).

`audit-log-service` runs at exactly one replica. The audit chain has a single writer by design
(ADR-0002); a second replica would fork it.

## Running locally

Requires Node.js 24 LTS and pnpm 9.

```bash
pnpm install
cp .env.example .env      # then replace every placeholder
docker compose up -d postgres redis rabbitmq minio clamav
pnpm start:dev <service>  # e.g. pnpm start:dev permission-service
```

Each service exposes `GET /health` and Swagger at `/docs`.

## Checks

```bash
pnpm lint          # ESLint, type-aware
pnpm format:check  # Prettier
pnpm test          # unit tests
pnpm test:e2e      # HTTP-level tests
pnpm build         # builds all ten applications
pnpm smoke         # starts each built service and calls /health
docker compose --env-file .env.example config --quiet
```

## Secrets

`.env` is git-ignored and must never be committed. `.env.example` holds placeholders only —
nothing in it is a working credential.
