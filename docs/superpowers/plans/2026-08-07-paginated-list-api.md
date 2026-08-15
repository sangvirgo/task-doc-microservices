# Paginated List API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every public list endpoint from an unbounded array to `{ items, pagination }` with bounded Prisma queries.

**Architecture:** Add one pagination schema, type, metadata helper, and Prisma offset helper to `@c17/contracts`. Controllers parse `page` and `page_size`; services count the authorized filtered dataset and fetch only `skip/take`; frontend clients and screens consume the same envelope.

**Tech Stack:** NestJS, TypeScript, Zod, Prisma, Jest/Supertest, Next.js/React, Vitest, Postman JSON.

---

### Task 1: Shared pagination contract

**Files:**
- Create: `backend/libs/contracts/src/pagination/pagination.ts`
- Create: `backend/libs/contracts/src/pagination/pagination.spec.ts`
- Modify: `backend/libs/contracts/src/index.ts`

- [ ] **Step 1: Write failing tests.** Test that `{}` parses to `{ page: 1, page_size: 20 }`, page and page size are positive integers, page size `101` is rejected, metadata for totals `0` and `45` is correct, and page 3/page size 25 yields `skip: 50, take: 25`.
- [ ] **Step 2: Verify RED.** Run `pnpm --dir backend exec jest --config ./jest.config.ts --runInBand libs/contracts/src/pagination/pagination.spec.ts`; it must fail because the module does not exist.
- [ ] **Step 3: Implement the contract.** Export `paginationQuerySchema` (`z.coerce.number().int().min(1).default(1)` and page size `.min(1).max(100).default(20)`), `PaginationQuery`, `PaginationMeta`, `PaginatedResponse<T>`, `createPaginationMeta(page, page_size, total)`, and `toPrismaPagination({ page, page_size })`. Use `Math.ceil(total / page_size)`, `total_pages: 0` for empty results, and derived `has_next`/`has_previous`.
- [ ] **Step 4: Verify GREEN.** Run the same Jest command and require all pagination contract tests to pass.
- [ ] **Step 5: Commit.** `git add backend/libs/contracts/src/pagination backend/libs/contracts/src/index.ts && git commit -m "feat: add shared pagination contract"`.

### Task 2: Paginate task and document APIs

**Files:**
- Modify: `backend/apps/task-management-service/src/tasks/tasks.controller.ts`
- Modify: `backend/apps/task-management-service/src/tasks/tasks.service.ts`
- Modify: `backend/apps/task-management-service/test/task-authorization.integration.spec.ts`
- Modify: `backend/apps/document-management-service/src/documents/documents.controller.ts`
- Modify: `backend/apps/document-management-service/src/documents/documents.service.ts`
- Modify: `backend/apps/document-management-service/src/tasks/task-documents.controller.ts`
- Modify: `backend/apps/document-management-service/src/tasks/task-documents.service.ts`
- Modify: `backend/apps/document-management-service/test/task-documents.service.spec.ts`
- Create: `backend/apps/task-management-service/test/pagination.integration.spec.ts`
- Create: `backend/apps/document-management-service/test/pagination.integration.spec.ts`

- [ ] **Step 1: Add failing tests.** Cover tasks, participants, comments, activity, task documents, documents, versions, records, transfer packages, retention holds, and disposal approvals. For page 2/page size 2 assert filtered `count`, `skip: 2`, `take: 2`, deterministic `orderBy`, and the `{ items, pagination }` response. Add an authorization test proving `total` is calculated after the existing user/task scope.
- [ ] **Step 2: Verify RED.** Run `pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/task-management-service/test apps/document-management-service/test`; failures must be caused by the missing envelope/count/skip/take behavior.
- [ ] **Step 3: Implement.** Parse `paginationQuerySchema` in each list controller. Pass `PaginationQuery` to services. Use `task.count/task.findMany`, `taskParticipant.count/taskParticipant.findMany`, `taskComment.count/taskComment.findMany`, `taskActivity.count/taskActivity.findMany`, `taskDocument.count/taskDocument.findMany`, `document.count/document.findMany`, `documentVersion.count/documentVersion.findMany`, `record.count/record.findMany`, `transferPackage.count/transferPackage.findMany`, `retentionHold.count/retentionHold.findMany`, and `disposalApproval.count/disposalApproval.findMany`. Every pair receives the existing authorized `where`, deterministic `orderBy`, `skip`, and `take`; map rows to DTOs and call `createPaginationMeta`.
- [ ] **Step 4: Verify GREEN.** Assert invalid page queries return 400, beyond-last pages return empty items with correct metadata, and existing authorization tests remain green.
- [ ] **Step 5: Commit.** `git add backend/apps/task-management-service backend/apps/document-management-service && git commit -m "feat: paginate task and document lists"`.

### Task 3: Paginate permission, notification, audit, user, monitoring, and security APIs

**Files:**
- Modify: `backend/apps/permission-service/src/permissions/permissions.controller.ts`
- Modify: `backend/apps/permission-service/src/permissions/permission.service.ts`
- Modify: `backend/apps/permission-service/test/permission-integration.spec.ts`
- Modify: `backend/apps/notification-service/src/notifications/notifications.controller.ts`
- Modify: `backend/apps/notification-service/src/notifications/notifications.service.ts`
- Modify: `backend/apps/notification-service/test/notification-authorization.spec.ts`
- Create: `backend/apps/notification-service/test/notification-pagination.spec.ts`
- Modify: `backend/apps/audit-log-service/src/audit/audit.controller.ts`
- Modify: `backend/apps/audit-log-service/src/audit/audit.service.ts`
- Modify: `backend/apps/audit-log-service/test/audit-integration.spec.ts`
- Modify: `backend/apps/user-role-management-service/src/users/users.controller.ts`
- Modify: `backend/apps/user-role-management-service/src/users/users.service.ts`
- Create: `backend/apps/user-role-management-service/test/users-pagination.spec.ts`
- Modify: `backend/apps/security-monitoring-service/src/monitoring/monitoring.controller.ts`
- Modify: `backend/apps/security-monitoring-service/src/monitoring/monitoring.service.ts`
- Create: `backend/apps/security-monitoring-service/test/monitoring-pagination.spec.ts`
- Modify: `backend/apps/document-security-service/src/security/security.controller.ts`
- Modify: `backend/apps/document-security-service/src/security/security-pipeline.service.ts`
- Create: `backend/apps/document-security-service/test/security-pagination.spec.ts`

- [ ] **Step 1: Add failing tests.** Cover grants, recipient notifications, audit events, users, employee directory, security alerts, security rules, and encryption records. Assert filtered count, bounded query, stable order, response metadata, and preserved actor/admin scope. Replace Audit's legacy `limit/offset` expectations with `page/page_size`.
- [ ] **Step 2: Verify RED.** Run `pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/permission-service/test apps/notification-service/test apps/audit-log-service/test apps/user-role-management-service/test apps/security-monitoring-service/test apps/document-security-service/test`.
- [ ] **Step 3: Implement.** Apply the same count/skip/take/envelope pattern. Preserve employee grant visibility, recipient notification visibility, admin-only monitoring, active employee directory filtering, and audit event filters.
- [ ] **Step 4: Verify GREEN.** Re-run the affected service suites and confirm no public list query remains unbounded.
- [ ] **Step 5: Commit.** `git add backend/apps/permission-service backend/apps/notification-service backend/apps/audit-log-service backend/apps/user-role-management-service backend/apps/security-monitoring-service backend/apps/document-security-service && git commit -m "feat: paginate permission audit and monitoring lists"`.

### Task 4: Migrate frontend clients and list screens

**Files:**
- Create: `frontend/web/src/types/pagination.ts`
- Create: `frontend/web/src/components/pagination-controls.tsx`
- Create: `frontend/web/src/components/pagination-controls.module.css`
- Create: `frontend/web/tests/pagination-api-contracts.test.ts`
- Create: `frontend/web/tests/pagination-controls.test.tsx`
- Modify: `frontend/web/src/api/admin.ts`, `audit.ts`, `documents.ts`, `grants.ts`, `notifications.ts`, `records.ts`, `retention.ts`, `tasks.ts`
- Modify: `frontend/web/src/features/admin/users-panel.tsx`, `monitoring-panel.tsx`, `audit-panel.tsx`
- Modify: `frontend/web/src/features/documents/document-list.tsx`, `document-detail.tsx`
- Modify: `frontend/web/src/features/grants/grant-list.tsx`
- Modify: `frontend/web/src/features/notifications/notification-list.tsx`
- Modify: `frontend/web/src/features/records/record-list.tsx`, `package-list.tsx`
- Modify: `frontend/web/src/features/retention/retention-panel.tsx`
- Modify: `frontend/web/src/features/tasks/task-list.tsx`, `task-detail.tsx`
- Modify: `frontend/web/tests/backend-contract-types.test.ts`
- Modify: `frontend/web/tests/audit-api-contracts.test.ts`
- Modify: `frontend/web/tests/phase3-api-contracts.test.ts`
- Modify: `frontend/web/tests/phase45-api-contracts.test.ts`

- [ ] **Step 1: Add failing frontend contract tests.** Define `PaginationMeta` and `PaginatedResponse<T>`, update mocked list responses to `{ items, pagination }`, and assert every API client sends `page` and `page_size` while preserving filters.
- [ ] **Step 2: Verify RED.** Run `pnpm --dir frontend/web test --run`; failures must show the old array response assumptions.
- [ ] **Step 3: Implement API migration.** Each list client accepts optional `{ page, page_size }`, defaults to 1/20, appends values with `URLSearchParams`, and returns `PaginatedResponse<T>`. Replace Audit's hard-coded `limit=50`.
- [ ] **Step 4: Implement UI controls.** Add a typed reusable control with previous/next buttons, current page, total pages, disabled bounds, and no rendering for one page. Each list screen owns page state and resets to page 1 when its filter scope changes; preserve loading/empty/error states.
- [ ] **Step 5: Verify.** Run `pnpm --dir frontend/web test --run` and `pnpm --dir frontend/web build`.
- [ ] **Step 6: Commit.** `git add frontend/web/src frontend/web/tests && git commit -m "feat: add frontend pagination controls"`.

### Task 5: Add Postman pagination collection

**Files:**
- Create: `docs/postman/C17-pagination.postman_collection.json`
- Modify only if needed: `docs/postman/C17-auth.postman_environment.json`

- [ ] **Step 1: Add requests.** Include documents, tasks, grants, notifications, audit events, users, security alerts, and retention holds using `?page=1&page_size=20`, the `{{access_token}}` bearer variable from `C17-auth.postman_environment.json`, and Postman tests asserting `items` plus all six metadata fields.
- [ ] **Step 2: Add boundaries.** Include page 2, page size 100, invalid page 0, invalid page size 101, and a valid beyond-last page. Assert 400 for invalid input and empty items for the valid empty page.
- [ ] **Step 3: Validate JSON.** Run `node --input-type=module -e "JSON.parse((await import('node:fs/promises')).readFileSync('docs/postman/C17-pagination.postman_collection.json','utf8')); console.log('valid')"`.
- [ ] **Step 4: Commit.** `git add docs/postman/C17-pagination.postman_collection.json docs/postman/C17-auth.postman_environment.json && git commit -m "docs: add paginated API Postman collection"`.

### Task 6: Full verification and live smoke tests

**Files:**
- Modify only when a verification failure identifies a real contract mismatch.

- [ ] **Step 1: Static checks.** Run `git diff --check`, `pnpm backend:lint`, and `pnpm lint`.
- [ ] **Step 2: Full tests.** Run `pnpm backend:test` and `pnpm --dir frontend/web test --run`; require zero failed suites/tests.
- [ ] **Step 3: Builds.** Run `pnpm backend:build` and `pnpm --dir frontend/web build`.
- [ ] **Step 4: Docker.** Run `docker compose up -d --build api-gateway task-management-service document-management-service permission-service notification-service audit-log-service user-role-management-service security-monitoring-service document-security-service`, then `docker compose ps` and require healthy services.
- [ ] **Step 5: Live checks.** With seeded employee/admin tokens verify page 1, page 2, page size 100, invalid query 400, beyond-last empty page, and authorized totals for documents, tasks, grants, notifications, audit events, and security alerts.
- [ ] **Step 6: Final review.** Run `git status --short` and `git diff --check`; report exact test/build/smoke counts and any expected Node engine warnings.
