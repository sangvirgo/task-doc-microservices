# Statistics Overview API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement `GET /api/statistics/overview` with JWT-derived `ME` scope, ADMIN-only `ORGANIZATION` scope, permission-safe aggregates, and verified tests.

**Architecture:** The API Gateway owns the public aggregation endpoint and calls read-only internal statistics handlers in the owning services. Task, document, user, and monitoring services calculate metrics from their own databases and existing permission rules; the Gateway combines validated responses and fails closed on dependency errors. No new database, status, or user impersonation input is introduced.

**Tech Stack:** NestJS, TypeScript, Zod, Prisma PostgreSQL clients, Jest, Supertest, API Gateway fetch fan-out, existing `@c17/auth-context` and `@c17/contracts`.

---

## File map

Create:

- `backend/apps/api-gateway/src/statistics/statistics.types.ts` — strict query parser and public/internal response types.
- `backend/apps/api-gateway/src/statistics/statistics.service.ts` — downstream fan-out, validation, and response composition.
- `backend/apps/api-gateway/src/statistics/statistics.controller.ts` — authenticated public route.
- `backend/apps/task-management-service/src/tasks/task-statistics.service.ts` — task-owned aggregates.
- `backend/apps/document-management-service/src/documents/document-statistics.service.ts` — document/task-document/retention aggregates.
- `backend/apps/user-role-management-service/src/users/user-statistics.service.ts` — organization user aggregates.
- `backend/apps/security-monitoring-service/src/monitoring/monitoring-statistics.service.ts` — employee and organization alert aggregates.
- `backend/apps/api-gateway/test/statistics-overview.spec.ts` — public route and fan-out tests.
- `backend/apps/task-management-service/test/task-statistics.integration.spec.ts` — task metrics and authorization.
- `backend/apps/document-management-service/test/document-statistics.integration.spec.ts` — PREVIEW and task-document scope.
- `backend/apps/user-role-management-service/test/user-statistics.integration.spec.ts` — user counts and growth.
- `backend/apps/security-monitoring-service/test/monitoring-statistics.integration.spec.ts` — alert counts.

Modify:

- `backend/apps/api-gateway/src/app.module.ts` — register the statistics controller/service.
- `backend/apps/task-management-service/src/tasks/tasks.controller.ts` and `src/app.module.ts` — internal task route/provider.
- `backend/apps/document-management-service/src/documents/documents.controller.ts` and `src/app.module.ts` — internal document route/provider.
- `backend/apps/user-role-management-service/src/users/users.controller.ts` and `src/app.module.ts` — internal user route/provider.
- `backend/apps/security-monitoring-service/src/monitoring/monitoring.controller.ts` and `src/app.module.ts` — internal monitoring route/provider.
- `docs/postman/C17-paginated-lists.postman_collection.json` — overview requests and assertions.

No Prisma schema, migration, Docker service, or new environment variable is required.

### Task 1: Add the strict public contract and route

**Files:**

- Create: `backend/apps/api-gateway/src/statistics/statistics.types.ts`
- Create: `backend/apps/api-gateway/src/statistics/statistics.controller.ts`
- Modify: `backend/apps/api-gateway/src/app.module.ts`
- Test: `backend/apps/api-gateway/test/statistics-overview.spec.ts`

- [ ] **Step 1: Write failing tests.** Build the existing Gateway AppModule, sign JWTs with the existing JwtService, and add tests for:
  - Employee plus `scope=ORGANIZATION` returns 403 and does not call fetch.
  - Missing scope, unknown `user_id`, reversed dates, invalid dates, and a range over 90 days return 400.
  - A request without a JWT remains 401 through the existing global guard.

- [ ] **Step 2: Verify RED.** Run `pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/api-gateway/test/statistics-overview.spec.ts`. It must fail because the route/provider does not exist.

- [ ] **Step 3: Implement the contract.** Define the exact eight statuses: `CREATED`, `ASSIGNED`, `IN_PROGRESS`, `WAITING_REVIEW`, `APPROVED`, `NEED_REVISION`, `REJECTED`, and `CANCELLED`. Parse a strict Zod object with only `scope`, `from`, and `to`; validate calendar dates, `from <= to`, and an inclusive maximum of 90 days. The controller must read the caller from Gateway `request.user`, reject Employee organization scope before fan-out, and never read a user id from query.

- [ ] **Step 4: Verify GREEN.** Re-run the focused test and require all route-boundary tests to pass.

- [ ] **Step 5: Commit.** Run `git add backend/apps/api-gateway/src/statistics backend/apps/api-gateway/src/app.module.ts backend/apps/api-gateway/test/statistics-overview.spec.ts && git commit -m "feat: add statistics overview route contract"`.

### Task 2: Add task-owned statistics

**Files:**

- Create: `backend/apps/task-management-service/src/tasks/task-statistics.service.ts`
- Modify: `backend/apps/task-management-service/src/tasks/tasks.controller.ts`
- Modify: `backend/apps/task-management-service/src/app.module.ts`
- Test: `backend/apps/task-management-service/test/task-statistics.integration.spec.ts`

- [ ] **Step 1: Write failing PostgreSQL integration tests.** Reuse the existing auth-header and Prisma setup. Seed visible parent/child tasks, a foreign task, all eight statuses, status history, activities, an overdue non-terminal task, and a terminal overdue task. Assert:
  - ME counts only tasks with the current user's participant row, including visible children.
  - `total_tasks` equals the sum of all eight status buckets.
  - APPROVED, REJECTED, and CANCELLED overdue tasks are excluded.
  - Foreign tasks and activities are excluded.
  - `task_trend.created` uses task `created_at`; `completed` uses status-history transitions to APPROVED.
  - Recent activity is at most 10 records.
  - Employee organization scope returns 403; ADMIN organization scope includes all tasks.

- [ ] **Step 2: Verify RED.** Run `NODE_ENV=test pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/task-management-service/test/task-statistics.integration.spec.ts`. It must fail because the internal route is missing.

- [ ] **Step 3: Implement `TaskStatisticsService`.** Use Task, TaskParticipant, TaskStatusHistory, and TaskActivity Prisma records. For ME add the existing participant filter; for ORGANIZATION require ADMIN and omit it. Apply the requested created-at range, compute overdue with the existing terminal-status rule and current time, create all eight zero-filled buckets, count child tasks independently, aggregate daily trends, and return only visible activity. Add `GET /tasks/internal/statistics` before parameterized task routes, require `CurrentUser`, parse the three query fields, and register the provider.

- [ ] **Step 4: Verify GREEN.** Re-run the task statistics suite and require status, child, overdue, trend, activity, and authorization tests to pass.

- [ ] **Step 5: Commit.** Run `git add backend/apps/task-management-service/src/tasks/task-statistics.service.ts backend/apps/task-management-service/src/tasks/tasks.controller.ts backend/apps/task-management-service/src/app.module.ts backend/apps/task-management-service/test/task-statistics.integration.spec.ts && git commit -m "feat: add task statistics aggregation"`.

### Task 3: Add document, task-document, and retention statistics

**Files:**

- Create: `backend/apps/document-management-service/src/documents/document-statistics.service.ts`
- Modify: `backend/apps/document-management-service/src/documents/documents.controller.ts`
- Modify: `backend/apps/document-management-service/src/app.module.ts`
- Test: `backend/apps/document-management-service/test/document-statistics.integration.spec.ts`

- [ ] **Step 1: Write failing integration tests.** Seed an owned document, an accessible foreign document with active PREVIEW grant, a foreign document without grant, an expired grant, visible/foreign task-document associations, and retention holds. Assert:
  - ME `visible_documents` counts distinct documents with active PREVIEW, not only owned documents.
  - Expired/no PREVIEW documents are excluded.
  - ME task-document count excludes foreign task associations.
  - ORGANIZATION counts all records and retention eligibility.
  - Employee organization scope returns 403.

- [ ] **Step 2: Verify RED.** Run `NODE_ENV=test pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/document-management-service/test/document-statistics.integration.spec.ts`. It must fail because the internal handler is missing.

- [ ] **Step 3: Implement `DocumentStatisticsService`.** For ME scan documents in the range and reuse `PermissionClient.check` with resource DOCUMENT and action PREVIEW; count distinct allowed documents. For task-document rows require the existing task context to identify the caller as a direct participant and require document PREVIEW access. For ORGANIZATION require ADMIN and count all document/association rows without exposing content. Reuse existing retention-expiry and active-hold rules. Internal-only ids may be returned for service correlation but must be stripped by Gateway. Add `GET /documents/internal/statistics`, require `CurrentUser`, and register the provider.

- [ ] **Step 4: Verify GREEN.** Re-run the document statistics suite and require ownership, grant, expiry, task-document, organization, retention, and 403 tests to pass.

- [ ] **Step 5: Commit.** Run `git add backend/apps/document-management-service/src/documents/document-statistics.service.ts backend/apps/document-management-service/src/documents/documents.controller.ts backend/apps/document-management-service/src/app.module.ts backend/apps/document-management-service/test/document-statistics.integration.spec.ts && git commit -m "feat: add permission-safe document statistics"`.

### Task 4: Add user and monitoring statistics

**Files:**

- Create: `backend/apps/user-role-management-service/src/users/user-statistics.service.ts`
- Modify: `backend/apps/user-role-management-service/src/users/users.controller.ts`
- Modify: `backend/apps/user-role-management-service/src/app.module.ts`
- Create: `backend/apps/security-monitoring-service/src/monitoring/monitoring-statistics.service.ts`
- Modify: `backend/apps/security-monitoring-service/src/monitoring/monitoring.controller.ts`
- Modify: `backend/apps/security-monitoring-service/src/app.module.ts`
- Test: `backend/apps/user-role-management-service/test/user-statistics.integration.spec.ts`
- Test: `backend/apps/security-monitoring-service/test/monitoring-statistics.integration.spec.ts`

- [ ] **Step 1: Write failing tests.** Seed users with both roles, locked/unlocked states, and different creation dates. Assert total, active employees, locked users, and cumulative growth. Seed current/foreign open and resolved alerts. Assert ME counts only current actor alerts, organization counts all open alerts, and Employee organization calls return 403.

- [ ] **Step 2: Verify RED.** Run `NODE_ENV=test pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/user-role-management-service/test/user-statistics.integration.spec.ts apps/security-monitoring-service/test/monitoring-statistics.integration.spec.ts`. Both suites must fail because handlers are missing.

- [ ] **Step 3: Implement the providers.** User statistics use only existing role, locked_at, and created_at fields and require ADMIN for organization scope. Monitoring statistics use existing SecurityAlert actor_id, status, and created_at; ME counts caller-owned alerts and organization counts OPEN alerts. Do not add descriptions, metadata, readiness values, or new state. Add protected internal routes and register providers.

- [ ] **Step 4: Verify GREEN.** Re-run both focused suites and require date filters, counts, ME scope, organization scope, and 403 behavior to pass.

- [ ] **Step 5: Commit.** Run `git add backend/apps/user-role-management-service backend/apps/security-monitoring-service && git commit -m "feat: add organization user and alert statistics"`.

### Task 5: Compose the public Gateway overview

**Files:**

- Create/modify: `backend/apps/api-gateway/src/statistics/statistics.service.ts`
- Modify: `backend/apps/api-gateway/src/statistics/statistics.types.ts`
- Modify: `backend/apps/api-gateway/test/statistics-overview.spec.ts`

- [ ] **Step 1: Write failing Gateway aggregation tests.** Mock fetch responses for task, document, user, monitoring, and audit calls. Assert:
  - ME response uses the JWT caller headers, contains the eight real status keys, and has no organization fields.
  - ADMIN organization response contains users, organization_tasks, security, retention, and growth_trend.
  - No downstream URL contains a query user id.
  - Internal ids and document content do not appear in the public response.
  - Any downstream network error, 5xx, invalid JSON, or schema mismatch returns 503 instead of partial data.

- [ ] **Step 2: Verify RED.** Run `pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/api-gateway/test/statistics-overview.spec.ts`. Boundary tests may pass, but successful ME, ADMIN, and fail-closed tests must fail until the aggregator exists.

- [ ] **Step 3: Implement `StatisticsService.getOverview`.** Use existing service URL environment variables and the Gateway timeout. Build internal URLs from scope/from/to, pass only authenticated caller headers, run independent calls with Promise.all, validate response shapes, and map task/document/user/monitoring/audit results into the approved public contract. Strip internal ids. Omit monitoring_consumer because no reliable existing readiness signal was found. Convert timeout, network, non-2xx, invalid JSON, and invalid shape to ServiceUnavailableException.

- [ ] **Step 4: Verify GREEN.** Re-run the Gateway suite and require authorization, query, ME, ADMIN, header propagation, field-shaping, and 503 tests to pass.

- [ ] **Step 5: Commit.** Run `git add backend/apps/api-gateway/src/statistics backend/apps/api-gateway/test/statistics-overview.spec.ts && git commit -m "feat: aggregate statistics overview"`.

### Task 6: Update Postman and run verification

**Files:**

- Modify: `docs/postman/C17-paginated-lists.postman_collection.json`

- [ ] **Step 1: Add Postman requests.** Add authenticated ME and ORGANIZATION requests for `/api/statistics/overview` using from/to dates. Do not add a user_id variable. Assert ME has all eight status keys and organization has users, organization_tasks, security, retention, and growth_trend.

- [ ] **Step 2: Run all new suites.** Run `NODE_ENV=test pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/api-gateway/test/statistics-overview.spec.ts apps/task-management-service/test/task-statistics.integration.spec.ts apps/document-management-service/test/document-statistics.integration.spec.ts apps/user-role-management-service/test/user-statistics.integration.spec.ts apps/security-monitoring-service/test/monitoring-statistics.integration.spec.ts`. Expected: all new suites pass.

- [ ] **Step 3: Run repository verification.** Run `pnpm backend:lint`, `pnpm --filter backend format:check`, `pnpm --dir backend build`, and the existing authorization suites for Gateway, task, document, and monitoring. Expected: all pass.

- [ ] **Step 4: Check scope and diff.** Run `git diff --check`, `git status --short`, and `git diff --stat`. Confirm only statistics implementation/tests/Postman changed; preserve the user's pre-existing .gitignore and task-assignment documents.

- [ ] **Step 5: Commit Postman coverage.** Run `git add docs/postman/C17-paginated-lists.postman_collection.json && git commit -m "test: document statistics overview requests"`.

