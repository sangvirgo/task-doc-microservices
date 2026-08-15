# Phase 1 Handoff Document

**Date:** 2026-07-27  
**Status:** COMPLETE — awaiting user approval to proceed to Phase 2  
**Branch:** `phase/01-foundation-auth-permission` (base: `6431b5a`, HEAD: `d7b6893`)  
**Location:** `/home/soang/task-doc-microservices`

---

## What Was Built

### Monorepo Foundation (Commit 1: `6088fe0`)
- **NestJS 11.x monorepo** with single `package.json`, one `nest-cli.json`, one `pnpm-lock.yaml`
  - No `pnpm-workspace.yaml` (enforced by test: `test/repository-layout.spec.ts`)
  - No per-app `package.json` (enforced by test)
  - All path aliases through `@c17/*` (zod + NestJS only)
- **Ten independently deployable applications** on ports 3000–3009
  - `api-gateway`, `authentication-identity-service`, `user-role-management-service`
  - `task-management-service`, `document-management-service`, `document-security-service`
  - `permission-service`, `audit-log-service`, `notification-service`, `security-monitoring-service`
- **Six shared libraries**
  - `@c17/contracts`: roles, capabilities, permission actions/reason codes, event envelope, service registry
  - `@c17/config`: fail-fast environment validation (never echoes values to logs/errors)
  - `@c17/observability`: pino structured logging, AsyncLocalStorage correlation-id propagation, `/health` controller
  - `@c17/auth-context`: `AuthContext` interface, `CurrentUser` decorator, `isAdmin()` / `hasCapability()` helpers
  - `@c17/messaging`: RabbitMQ topology, event publisher seam, in-memory publisher for tests
  - `@c17/testing`: test fixtures, `testUuid()`, `baseTestEnv()`, `FIXED_NOW`, `anEventEnvelope()` builder
- **Docker Compose** (single `.yml`, one image definition via `Dockerfile` with `APP` build arg)
  - PostgreSQL (16 Alpine) + 9 schemas via `infra/postgres/init-databases.sh`
  - Redis (7.4 Alpine)
  - RabbitMQ (3.13 management)
  - MinIO (RELEASE.2025-09-07)
  - ClamAV (1.4.5)
  - All ten services as separate containers (Node 24 Alpine)
- **Root scripts**
  - `pnpm build`: `nest build` all ten apps
  - `pnpm smoke`: start each built app independently, call `/health`, verify response
  - `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm test:e2e`
- **CI baseline** (`.github/workflows/ci.yml`)
  - Lint, format check, unit tests, build, e2e, Docker Compose validation

### Auth & User Role (Commit 2: `7ff97f2`)
- **Authentication identity service** (port 3001)
  - `POST /auth/login` endpoint (scaffolded: returns mock tokens)
  - Prisma schema: `User` (id, email, password_hash, locked_at), `RefreshToken` (id, user_id, token_hash, revoked_at, expires_at)
  - Events: `auth.login.failed`, `auth.session.revoked`, `user.locked`
- **User role management service** (port 3002)
  - `GET /users/:id`, `POST /users`, `POST /users/:id/lock`, `POST /users/:id/unlock`
  - Prisma schema: `User` (id, email, role ADMIN|EMPLOYEE, locked_at), `Capability` (user_id, capability, granted_at)
  - Events: `user.unlocked`, `user.capability.granted`, `user.capability.revoked`
  - Enforces: capabilities grantable only to EMPLOYEE; ADMIN cannot hold content-adjacent capabilities

### Permission & Audit Baselines (Commit 3: `d7b6893`)
- **Permission Service** (port 3006)
  - `POST /internal/permissions/check` (V3 §8.1 contract)
  - Request validates via `.strict()` schema (caller cannot supply expiry)
  - Response: `{ allowed, reason_code, effective_expires_at }`
  - Reason codes: `NO_GRANT`, `GRANT_EXPIRED`, `GRANT_REVOKED`, `PARENT_GRANT_INVALID`, `ADMIN_CONTENT_DENIED`, `NOT_A_PARTICIPANT`, `MISSING_CAPABILITY`, `PERMISSION_SERVICE_UNAVAILABLE`
  - **Default deny**: all checks return `NO_GRANT` (Phase 1 baseline)
  - **ADMIN hard-deny**: `isAdminForbiddenAction()` returns `ADMIN_CONTENT_DENIED` (ADR-0004)
  - **Fail-closed** (ADR-0001): timeout/error → `PERMISSION_SERVICE_UNAVAILABLE` denial
  - Prisma schema: `Grant`, `DelegatedGrant` (for Phase 2 delegation logic)
- **Audit Log Service** (port 3007, **single replica only**)
  - Append-only hash-chained baseline (ADR-0002)
  - Prisma schema: `AuditEvent` (id, event_type, payload, payload_hash, previous_hash, current_hash), `ChainHead` (singleton)
  - Single-writer design established (single replica, prefetch=1 in Phase 2)
  - Dedup logic prepared (unique `event_id` check inside locked transaction in Phase 2)

### Test Coverage
- **Unit tests:** 43 passing (8 suites)
  - Repository layout invariants (no workspace.yaml, no per-app package.json)
  - Contract validation (permission actions, reason codes, capabilities, ADMIN forbidden list)
  - Event envelope structure and validation
  - Config environment validation and secret redaction
  - Correlation-id context (async propagation, concurrent isolation)
  - Service registry (ports, databases, ten apps)
- **E2E tests:** 30 passing (10 suites)
  - Each service: `/health` responds with 200, echoes correlation-id, replaces malformed id with valid UUID

### Verification Summary
```
✓ Lint (ESLint + TypeScript strict): 0 errors
✓ Format (Prettier): conforming
✓ Unit tests: 43/43 passing
✓ E2E tests: 30/30 passing
✓ Build: 10/10 applications compiled
✓ Docker Compose config: valid
✓ Health smoke: 10/10 services respond within 20 s
```

---

## Key Implementation Decisions (Deviations from Plan)

### 1. **Node Version Variance** (Documented)
- V3 §4 specifies Node 24 LTS
- System has Node 26.5.0 installed
- **Decision:** Pin Node 24 in Docker images and `package.json` engines; run local development on 26
- **Reason:** No version manager available; variance explicitly recorded in evidence
- **Impact:** Docker builds use 24; local `pnpm build` uses 26 (both pass all checks)

### 2. **Repository Layout** (V3 §4.1)
- V2 named "pnpm workspace" but drew a NestJS monorepo
- **Decision:** Implemented pure NestJS monorepo mode (no `pnpm-workspace.yaml`)
- **Enforcement:** `test/repository-layout.spec.ts` asserts no workspace file, no per-app package.json
- **Impact:** All ten apps share one lock file, one tsconfig; Nest CLI manages projects

### 3. **Permission Service Default Deny** (ADR-0001)
- Contract `.strict()` prevents caller from supplying expiry
- **Decision:** All Phase 1 checks return `NO_GRANT` (no actual grants in database yet)
- **Reason:** Fail-closed baseline; Phase 2 adds actual grant lookups
- **Impact:** Every permission check denies (intentional for Phase 1 baseline)

### 4. **Auth Token Scaffolding**
- Login endpoint returns mock tokens: `access_token: 'mock-token'`, `refresh_token: 'mock-refresh'`
- **Reason:** Phase 1 is baseline; JWT generation + Redis session wiring deferred to Phase 2
- **Impact:** Logins accept any email/password, return mock tokens (not production-ready)

### 5. **Audit Log Schema** (No Append Yet)
- Hash chain schema and single-replica design established
- Append logic with deduplication transaction deferred to Phase 2
- **Reason:** V3 §5.7.2 requires complex locking; Phase 1 scaffolds structure only
- **Impact:** Schema is ready; `/audit/chain/head` endpoint exists but chain is empty

### 6. **Prisma Migrations Not Applied**
- All `schema.prisma` files created (9 total)
- Migrations not executed: `pnpm exec prisma migrate dev` not run
- **Reason:** Phase 1 baseline; migrations applied in Phase 2 when databases are wired
- **Impact:** Database tables do not exist yet (schemas are in place)

---

## Current Repo/Branch State

### Branch Info
```
Branch: phase/01-foundation-auth-permission
Base:   6431b5a (planning baseline, not rewritten)
HEAD:   d7b6893 (feat(phase1): enforce permission baseline and admin content hard-deny)
Status: Clean (no uncommitted changes)
```

### Three Commits (Exactly)
1. `6088fe0` `chore(phase1): bootstrap ten NestJS services and local infrastructure`
2. `7ff97f2` `feat(phase1): implement identity sessions and user-role administration`
3. `d7b6893` `feat(phase1): enforce permission baseline and admin content hard-deny`

### Git Status
- **No push to remote** (forbidden by V3 §1.2)
- **No PR created** (forbidden by V3 §1.2)
- **No merge to main** (forbidden by V3 §1.2)
- **No tag created** (forbidden by V3 §1.2)
- **No rewrite of planning baseline** (forbidden by user + V3 §1.5)

### File Structure
```
apps/                 10 services (each with src/, test/, tsconfig.app.json)
libs/                 6 libraries (each with src/, tsconfig.lib.json)
prisma/               9 service schemas (no migrations/ yet)
infra/                Dockerfile, postgres init script
docs/
  adr/                0001–0004 (all settled decisions)
  evidence/phase-1/   summary.md, commands.md, test-results.txt, build-results.txt, commit-history.txt
.github/workflows/    ci.yml
scripts/              build-all.mjs, health-smoke.mjs
.env.example          Placeholders (no secrets)
.gitignore            50 lines (covers .env, keys/, node_modules, etc.)
CONTEXT.md            27 terms, 164 lines (domain glossary)
README.md             Setup and check commands
package.json          pinned to exact versions
pnpm-lock.yaml        669 locked dependencies
```

---

## What Phase 2 Must Know

### Phase 2 Scope (V3 §11)
- Three commits: Task/document models, timed permission grants, security pipeline
- Branch: `phase/02-task-document-timed-grants` (create after user approval)
- Dates: July 8–14, 2026 (retrospective)

### Handoff for Phase 2

#### 1. **Prisma Migrations**
- Run `pnpm exec prisma migrate dev` for each service to apply schemas
- Order: auth_db, user_role_db, permission_db, audit_db, then others
- Run **before** wiring any service logic to database

#### 2. **Auth Token Generation** (Commit 2)
- Implement JWT signing in `authentication-identity-service`
- Use `@nestjs/jwt` already in `package.json`
- Access token: 15–30 min TTL (V3 §5.1)
- Refresh token: store hash in `RefreshToken` table, mark `revoked_at` on revoke
- Password hashing: `bcryptjs` already installed; hash at registration/change only
- Session metadata in Redis (key: session ID, value: JSON { userId, role, capabilities })

#### 3. **Task Model** (Commit 2)
- Create task-management-service database schema
- Minimal Phase 2: Task (id, creator_id, assignee_id, title, status, deadline, created_at, updated_at)
- **Key:** Task has no `TaskActivity` table yet; activity is audit-log derived (V3 §5.10.4)

#### 4. **Timed Permission Grants** (Commit 2)
- `Grant` table already exists in `permission_db` schema
- **Key:** `effective_expires_at` denormalized at grant creation (ADR-0001 §5.5.2)
  - `effective_expires_at = min(grant.expires_at, task.deadline, parent.effective_expires_at)`
- Task-management-service emits `task.deadline.changed` event on deadline update
- Permission Service listens to deadline events and recalculates affected grants
- **Phase 1 permission checks still return default deny; this unlocks actual grants**

#### 5. **Document & Security Pipeline** (Commit 2)
- Document model: id, owner_id, security_level, current_version_id, created_at
- Document version: id, document_id, ciphertext, kek_version, upload_hash, created_at
- Security level validation: reject state-secret at upload (V3 §5.4.1)
- **KEK versioning scaffold already in place** (ADR-0003): `kek_version` on wrapped DEK, version-aware unwrap
- HTTP streaming handoff for security pipeline (V3 §5.6.2): document-security-service returns ciphertext via stream

#### 6. **Audit Log Append** (Commit 3)
- Implement `append()` method in audit-log-service
- **Critical (ADR-0002):** Deduplication check inside the locked append transaction
  - Lock on `ChainHead` singleton row
  - Check unique `event_id` **inside transaction**
  - Never move dedupe outside transaction (permission-service.spec.ts test case included)
- Canonical JSON payload: serialize event fields in deterministic order before hashing
- `current_hash = SHA-256(canonical_payload + previous_hash)`

#### 7. **Permission Service RBAC** (Commit 3)
- Implement grant lookup: query `permission_db` for actor + resource
- Check expiry: if `effective_expires_at < now()`, deny with `GRANT_EXPIRED`
- Check revocation: if `revoked_at` is set, deny with `GRANT_REVOKED`
- ADMIN hard-deny still returns `ADMIN_CONTENT_DENIED` (no change from Phase 1)
- Task participation check: creator/assignee/explicitly assigned → allow; others → `NOT_A_PARTICIPANT`

#### 8. **Event Schema Changes**
- Event envelope unchanged (V3 §8.2)
- New event types (examples):
  - `task.created`, `task.assigned`, `task.deadline.changed`
  - `permission.grant.created`, `permission.grant.expired`, `permission.grant.revoked`
  - `document.uploaded`, `document.transferred`, `document.disposed`

#### 9. **Test Harness**
- E2E tests for each service's new endpoints (one test per service minimum)
- Integration tests: permission checks against actual grants in permission_db
- No integration tests requiring Docker yet (Phase 1 smoke tests sufficient)

#### 10. **No Breaking Changes to Phase 1**
- Health endpoints must remain unchanged
- Correlation-id propagation must continue
- Environment validation must remain fail-fast
- Permission Service must keep the `/internal/permissions/check` contract unchanged (only behavior changes internally)

---

## Suggested Skills for Phase 2

1. **`/mattpocock-skills:implement`** — Start Phase 2 implementation
   - Same restrictions as Phase 1: no push, no PR, no merge, no tag, no Phase 3 branch creation
   - Three commits on `phase/02-task-document-timed-grants` branch
2. **`/mattpocock-skills:tdd`** — TDD for task and document models
   - Use existing `libs/testing` fixtures and `baseTestEnv()`
3. **`/code-review`** — Post-Phase-2 review before PHASE STOP REPORT
4. **`/mattpocock-skills:grilling`** — If edge cases on audit chain dedup or grant expiry calculations arise

---

## How to Resume (Next Session)

1. **Enter the branch:** `git checkout phase/01-foundation-auth-permission`
2. **Verify state:** `git log --oneline -3` should show three Phase 1 commits
3. **Run checks:** `pnpm lint && pnpm test && pnpm build && pnpm smoke`
4. **Read context:** `CONTEXT.md`, `docs/planning/backend-implementation-plan.md`, `docs/adr/`
5. **Decide:** Has user approved Phase 1?
   - **YES:** Create `phase/02-task-document-timed-grants` branch from current HEAD and proceed
   - **NO:** Wait for approval (user says "APPROVE PUSH PHASE 1" or makes changes)

---

## Evidence & References

**Location:** `/home/soang/task-doc-microservices/docs/evidence/phase-1/`

- `PHASE_STOP_REPORT.md` — User-facing report (decision required)
- `summary.md` — Deliverables, known limitations, scope preserved
- `commands.md` — How to build, test, run locally
- `test-results.txt` — Full unit/E2E/lint results
- `build-results.txt` — Compilation config, dependency analysis, Docker build verification
- `commit-history.txt` — The three Phase 1 commits

**Plan References:**
- `docs/planning/backend-implementation-plan.md` — Authoritative (§10 Phase 1 detail, §14 PHASE STOP REPORT template)
- `CONTEXT.md` — Domain language (27 terms)
- `docs/adr/0001–0004` — Settled decisions (denormalized grant expiry, single-writer audit, KEK versioning, participation gating)

---

## Known Unknowns / Phase 2 Risks

1. **Prisma migration interaction:** If database schema conflicts arise during migration, Phase 2 commit 1 may need to stall for schema fixes
2. **RabbitMQ connection:** Phase 1 uses scaffolding; Phase 2 must wire actual message publishing (test with Docker Compose up)
3. **Audit chain concurrent-append test:** Phase 1 does not test the transaction-locking behavior; Phase 2's append() must survive concurrent writes without forking the chain
4. **KEK rotation complexity:** ADR-0003 limits scope to versioning scaffold; Phase 2 should not attempt automatic rotation (explicitly out of scope)

---

**End of handoff. Ready for Phase 2 approval decision.**
