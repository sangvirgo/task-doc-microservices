# C17 — Task Assignment and Secure Digital Document Sharing Platform

An organizational platform where work is assigned as tasks, and access to confidential documents
is granted only for as long as the task that justifies it remains live.

Start with [CONTEXT.md](CONTEXT.md) for the domain language, then
[docs/planning/backend-implementation-plan.md](docs/planning/backend-implementation-plan.md) for the plan.
Decisions that outrank the plan live in [docs/architecture/adr/](docs/architecture/adr/).

## Repository Layout

This is a **pnpm workspace monorepo** with separate backend and frontend packages.

```
backend/   NestJS monorepo — ten independently deployable services + shared libraries
frontend/  Reserved for the frontend application (not yet imported)
docs/      Architecture decisions, planning documents, and reports
infra/     Shared infrastructure (Docker Compose at root)
```

### Backend

The backend is a NestJS monorepo managed by pnpm with ten independently deployable services.

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

No service reads another service's database.

`audit-log-service` runs at exactly one replica. The audit chain has a single writer by design
(ADR-0002); a second replica would fork it.

## Running Locally

Requires Node.js 24 LTS and pnpm 9.

```bash
pnpm install
cp .env.example .env      # then replace every placeholder
docker compose up -d postgres redis rabbitmq minio clamav
pnpm backend:start:dev permission-service  # e.g.
```

Each service exposes `GET /health` and Swagger at `/docs`.

## Commands

```bash
# Backend
pnpm backend:lint          # ESLint, type-aware
pnpm backend:build         # builds all ten applications
pnpm backend:test          # unit tests
pnpm backend:test:e2e      # HTTP-level tests
pnpm backend:smoke         # starts each built service and calls /health
pnpm backend:verify        # full backend verification suite

# Docker
docker compose --env-file .env.example config --quiet
docker compose up -d
docker compose down
```

## Secrets

`.env` is git-ignored and must never be committed. `.env.example` holds placeholders only —
nothing in it is a working credential.
