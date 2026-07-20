# C17 Task and Secure Document Platform

An organizational platform where work is assigned as tasks, and access to confidential
documents is granted only for as long as the task that justifies it remains live.

## 1. Project Overview

This platform provides:

- **Organizational task assignment** with lifecycle management, deadlines, child tasks, and review workflows
- **Secure document sharing** through time-bounded permission Grants derived from Tasks
- **Permission Grants** with effective expiry, delegation, and cascade revocation
- **Encrypted object storage** using AES-256-GCM with versioned Key-Encrypting Keys (KEK)
- **Tamper-evident Audit Trail** using a hash-chain ledger with single-writer serialization
- **Notifications and Security Monitoring** with rule-based alerting
- **Records, Transfer Packages, retention, and controlled Disposal** for archival workflows

This is an academic/demo project. It is not production-certified.

## 2. Current Implementation Status

| Component | Status |
|---|---|
| Backend services | Implemented — 10 NestJS microservices |
| PostgreSQL databases | 9 service databases with Prisma migrations |
| Redis | Session store and caching |
| RabbitMQ | Event publishing (publisher implemented, consumers pending) |
| MinIO | Local S3-compatible object storage |
| ClamAV | Malware scanning in the Security Pipeline |
| Docker Compose | Complete local runtime stack |
| Real security E2E verification | Implemented and passing |
| Frontend | Directory prepared (`frontend/`); no framework code yet |

## 3. Repository Structure

```
backend/           NestJS monorepo — ten independently deployable services + shared libraries
frontend/          Responsive web frontend (not yet implemented)
docs/              Architecture decisions, planning documents, reports, and frontend guidance
docker-compose.yml Local development and evaluation stack
package.json       Root workspace scripts
pnpm-workspace.yaml  Workspace package declarations
CLAUDE.md          Agent context retrieval policy
CONTEXT.md         Domain vocabulary and ubiquitous language
```

**Ownership:**

- `backend/` — all backend applications, tests, Prisma schemas, and infrastructure scripts
- `frontend/` — the responsive web frontend (to be implemented)
- `docs/` — architecture decisions (ADRs), implementation plans, status reports, and frontend integration guidance
- Root `docker-compose.yml` — orchestrates the complete local runtime

## 4. Backend Services

| Service | Responsibility | Application Directory | Database | Host Port |
|---|---|---|---|---|
| API Gateway | JWT validation, rate limiting, proxy routing | `backend/apps/api-gateway/` | — | 3000 |
| Authentication & Identity | Registration, login, refresh token rotation, logout, session management | `backend/apps/authentication-identity-service/` | `auth_db` | 3001 |
| User-Role Management | User CRUD, lock/unlock, capability grant/revoke | `backend/apps/user-role-management-service/` | `user_role_db` | 3002 |
| Task Management | Task lifecycle, comments, submissions, reviews, participants, activity | `backend/apps/task-management-service/` | `task_db` | 3003 |
| Document Management | Document CRUD, versions, download tickets, records, transfer packages | `backend/apps/document-management-service/` | `document_db` | 3004 |
| Document Security | Security Pipeline: scan, encrypt, sign, store; KEK management | `backend/apps/document-security-service/` | `document_security_db` | 3005 |
| Permission | Grant CRUD, delegation, cascade revocation, fail-closed permission checks | `backend/apps/permission-service/` | `permission_db` | 3006 |
| Audit Log | Append-only hash-chain audit events, chain verification | `backend/apps/audit-log-service/` | `audit_db` | 3007 |
| Notification | In-app notifications, read tracking, preferences | `backend/apps/notification-service/` | `notification_db` | 3008 |
| Security Monitoring | Security event recording, threshold-based alerting, rule management | `backend/apps/security-monitoring-service/` | `security_monitoring_db` | 3009 |

No service reads another service's database.

`audit-log-service` runs at exactly one replica. The audit chain has a single writer by design (ADR-0002); a second replica would fork it.

## 5. Infrastructure

| Component | Image | Purpose |
|---|---|---|
| PostgreSQL | `postgres:16.10-alpine` | Nine service databases (database-per-service) |
| Redis | `redis:7.4.7-alpine` | Session store and caching |
| RabbitMQ | `rabbitmq:3.13.7-management-alpine` | Asynchronous domain events (exchange: `c17.domain`) |
| MinIO | `minio/minio:RELEASE.2025-09-07T16-13-09Z` | Local S3-compatible object storage for encrypted documents |
| ClamAV | `clamav/clamav:1.4.5` | Malware scanning in the Security Pipeline |

**Storage principles:**

- MinIO is the local S3-compatible object store — only ciphertext is stored there
- PostgreSQL stores metadata, not raw document bytes
- The storage adapter may later target AWS S3 or Cloudflare R2 through configuration
- Clients must never receive `object_key`, storage credentials, or direct private-object URLs

## 6. Prerequisites

- **Node.js** >= 24 < 25
- **pnpm** 9.15.9 (declared in `packageManager`)
- **Docker** and **Docker Compose**
- **Git**

## 7. Installation

```bash
# Clone the repository
git clone <repository-url>
cd c17-task-document-platform

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env and replace every placeholder with a working value
# WARNING: Never commit .env or use real secrets in .env.example

# Start infrastructure
docker compose up -d postgres redis rabbitmq minio clamav
```

## 8. Common Commands

```bash
# Install dependencies
pnpm install

# Backend lint (ESLint, type-aware)
pnpm backend:lint

# Backend build (all ten applications)
pnpm backend:build

# Backend unit tests
pnpm backend:test

# Backend E2E tests
pnpm backend:test:e2e

# Backend full verification suite
pnpm backend:verify

# Docker Compose
pnpm docker:config       # Validate compose file
pnpm docker:build        # Build service images
pnpm docker:up           # Start all containers
pnpm docker:down         # Stop all containers
```

## 9. Full Backend Verification

```bash
NODE_ENV=test bash backend/scripts/verify-full-backend.sh
```

This script verifies:

- Environment safety (no real secrets in test config)
- Docker infrastructure health
- Application health endpoints
- Prisma migration status
- Lint pass
- Build pass
- Important integration suites
- E2E workflows
- Real document security pipeline (scan, encrypt, sign, store, download)
- Audit-chain integrity

## 10. Security Principles

- **Default deny** — every permission check returns denied unless a valid Grant exists
- **Fail closed** — Permission Service unavailability produces a denial, never an allow
- **ADMIN manages the platform** but never accesses Task content or Document content
- **EMPLOYEE is the content-participating role** — only EMPLOYEEs may hold Grants or join Tasks
- **Every ordinary Document Grant must be justified by a Task** — `source_task_id` is mandatory
- **No access survives Grant expiry or revocation** — effective expiry is checked at request time
- **Comment content is confidential** — never written to the Audit Trail
- **Raw Document and Comment content must not enter Audit events**
- **State-secret material is rejected at upload** — no Document is created
- **Secure download is mediated by a ticket** — single-use, time-limited, with request-time permission recheck

## 11. Frontend Development

- **Location:** `frontend/`
- **Type:** Responsive mobile-first web application
- **Framework:** Not yet selected (no frontend code implemented)
- **Integration guide:** `docs/frontend/frontend-development-guide.md`

## 12. Documentation

| Document | Path |
|---|---|
| Domain vocabulary | [CONTEXT.md](CONTEXT.md) |
| Agent context policy | [CLAUDE.md](CLAUDE.md) |
| Architecture Decision Records | [docs/adr/](docs/adr/) |
| Backend implementation plan | [docs/planning/backend-implementation-plan.md](docs/planning/backend-implementation-plan.md) |
| Backend status report | [docs/reports/backend-status-report.md](docs/reports/backend-status-report.md) |
| Frontend development guide | [docs/frontend/frontend-development-guide.md](docs/frontend/frontend-development-guide.md) |

## 13. Git Workflow

- Use focused feature branches from `main`
- Do not commit `.env`, `dist/`, `node_modules/`, generated uploads, plaintext, ciphertext, or logs
- Use factual, focused commit messages
- Run relevant verification before sharing changes

Do not push, merge, or create Pull Requests without explicit authorization.
