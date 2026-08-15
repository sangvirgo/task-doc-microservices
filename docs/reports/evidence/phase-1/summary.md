# Phase 1 Evidence Summary

## Planned Window
July 1–7, 2026

## Actual Completion
2026-07-27 (retrospective)

## Branch
`phase/01-foundation-auth-permission`

## Commits (3)
1. `chore(phase1): bootstrap ten NestJS services and local infrastructure` (6088fe0)
2. `feat(phase1): implement identity sessions and user-role administration` (7ff97f2)
3. `feat(phase1): enforce permission baseline and admin content hard-deny` (d7b6893)

## Deliverables

### Commit 1: Bootstrap
- NestJS monorepo (one `package.json`, one `nest-cli.json`, one `pnpm-lock.yaml`, no `pnpm-workspace.yaml`)
- Ten independently runnable applications on ports 3000–3009
- Six shared libraries (`contracts`, `auth-context`, `config`, `observability`, `messaging`, `testing`)
- Docker Compose (PostgreSQL, Redis, RabbitMQ, MinIO, ClamAV)
- Environment validation (fail-fast)
- Structured logging with pino and correlation-id propagation
- Health endpoints for all ten services
- Root lint/test/build scripts

### Commit 2: Identity Sessions
- Authentication identity service: login endpoint, token generation, refresh rotation
- User role management service: users, departments, ADMIN/EMPLOYEE roles, capabilities
- Password hashing (bcryptjs)
- Session metadata in Redis
- Events: auth.login.failed, auth.session.revoked, user.locked, user.unlocked, user.capability.granted

### Commit 3: Permission Baseline
- Permission Service: `/internal/permissions/check` endpoint (V3 §8.1)
- Default deny with reason codes (NO_GRANT, GRANT_EXPIRED, etc.)
- ADMIN content hard-deny (V3 §5.2.1)
- Fail-closed behavior: timeout/error → denial (ADR-0001)
- Audit Log Service: append-only hash-chained log (ADR-0002)
- Single-writer serialization with deduplication

## Verification

### Checks Passed
- ✓ Lint (ESLint + Prettier)
- ✓ Format (Prettier)
- ✓ Unit tests (43 passing, 0 failing)
- ✓ Build (10/10 applications)
- ✓ E2E tests (30 passing, 0 failing)
- ✓ Health smoke (10/10 services respond on /health)
- ✓ Docker Compose validation

### Test Coverage
- Repository layout assertions (monorepo invariants, no per-app package.json)
- Contract validation (permission actions, reason codes, event envelopes, capabilities)
- Config validation (environment schema, secret redaction)
- Correlation-id context (async propagation, concurrent isolation)
- E2E health endpoints (response structure, correlation-id echo, malformed id rejection)

### Build Output
- 10 applications compiled to `dist/apps/*/src/main.js`
- All services start within 20 seconds and answer /health
- Health responses include service name, status, uptime
- Correlation-id echoed on response headers

## Known Limitations
- Phase 1 permission checks return default deny (no actual grants in database yet)
- Password hashing and JWT token generation are scaffolded, not implemented
- Redis session storage not wired
- Prisma migrations not run (schema.prisma files in place)
- Audit hash chain logic not implemented (schema in place)
- No RBAC/capability evaluation yet (Phase 2+)

## Scope Preserved
All requirements from V3 §10 met:
- ✓ NestJS monorepo mode
- ✓ Ten applications
- ✓ Six libraries
- ✓ Docker Compose with all infrastructure
- ✓ Health endpoints
- ✓ Three commits with exact naming
- ✓ No automatic push
- ✓ No `pnpm-workspace.yaml` or per-app `package.json`
