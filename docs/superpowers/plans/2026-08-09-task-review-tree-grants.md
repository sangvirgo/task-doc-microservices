# Task Review, Task Tree, and Task-Document Grants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Extend the backend so a task detail response exposes safe child summaries, task creators can edit task metadata, each task has an explicit reviewer, submissions can be listed and reviewed safely, deadline changes propagate to document grants, and task-scoped document grants can be managed per grant.

**Architecture:** Keep task lifecycle and submission invariants in the task-management service. Add reviewer membership to the task aggregate, return only bounded child summaries from task detail, and keep submission content behind dedicated permission-checked endpoints. Keep document-grant persistence in permission-service, with document-management-service remaining the task-document authorization adapter. Publish lifecycle events through the existing task outbox so notification and permission consumers remain decoupled.

**Tech Stack:** NestJS, TypeScript, Prisma/PostgreSQL, Zod, Jest/Supertest, RabbitMQ outbox consumers.

---

### Task 1: Extend contracts and Prisma models

**Files:**
- Modify: `backend/prisma/task-management-service/schema.prisma`
- Create: `backend/prisma/task-management-service/migrations/20260809120000_task_review_tree_grants/migration.sql`
- Modify: `backend/libs/contracts/src/events/event-types.ts`
- Modify: `backend/apps/task-management-service/src/tasks/tasks.service.ts`
- Modify: `backend/apps/document-management-service/src/tasks/task-context.client.ts`

- [ ] Add nullable `reviewer_id` to `Task`, index it, and add `TASK_SUBMITTED` and `TASK_REVIEWED` event types.
- [ ] Add a migration that backfills existing rows with `reviewer_id = creator_id` before enforcing the application invariant.
- [ ] Extend task DTO/context types with reviewer data and safe child summary fields.
- [ ] Run Prisma generation/typecheck and verify the migration is syntactically valid.

### Task 2: Write failing task-management tests first

**Files:**
- Modify: `backend/apps/task-management-service/test/task-authorization.integration.spec.ts`
- Create or modify: `backend/apps/task-management-service/test/task-submissions.service.spec.ts`

- [ ] Add failing HTTP tests for creator-only metadata patching, non-creator denial, reviewer assignment, and child summaries in `GET /tasks/:id`.
- [ ] Add failing HTTP tests for submission list/detail visibility, task-scoped review route, wrong-task submission rejection, old/non-pending submission rejection, and reviewer-only review authorization.
- [ ] Add failing tests that submit/review create outbox rows with the expected payloads and that deadline changes create `TASK_DEADLINE_CHANGED`.
- [ ] Run the focused Jest files and confirm the new assertions fail for the intended missing behavior.

### Task 3: Implement task metadata, reviewer, and child-summary APIs

**Files:**
- Modify: `backend/apps/task-management-service/src/tasks/tasks.controller.ts`
- Modify: `backend/apps/task-management-service/src/tasks/tasks.service.ts`
- Modify: `backend/apps/task-management-service/src/users/user-role.client.ts` if reviewer validation needs a shared call

- [ ] Add Zod schemas for metadata patch and reviewer assignment.
- [ ] Add `PATCH /tasks/:id` and enforce immutable creator-only metadata edits; reject parent reassignment through this endpoint.
- [ ] Add `PUT /tasks/:id/reviewer`, validate the reviewer as an employee, and maintain a `REVIEWER` participant without removing creator/assignee membership.
- [ ] Make task creation default reviewer to creator while accepting an explicit reviewer and adding that reviewer as a participant.
- [ ] Add direct child summaries to the direct-participant task detail response; do not include submission content or document bodies.
- [ ] Emit a deadline-changed outbox event inside the same metadata transaction when the deadline changes.
- [ ] Run the focused task authorization tests until green.

### Task 4: Implement safe submission retrieval and review lifecycle

**Files:**
- Modify: `backend/apps/task-management-service/src/tasks/tasks.controller.ts`
- Modify: `backend/apps/task-management-service/src/tasks/tasks.service.ts`
- Modify: `backend/prisma/task-management-service/schema.prisma` only if an attempt/current-submission constraint is required
- Modify: `frontend/web/src/api/tasks.ts` only if the new nested route needs a contract update

- [ ] Add `GET /tasks/:id/submissions` with pagination and `GET /tasks/:id/submissions/:submissionId` with task ownership checks.
- [ ] Return typed submission DTOs containing task, author, content, status, review metadata, and timestamps.
- [ ] Add `POST /tasks/:taskId/submissions/:submissionId/review`; retain the old route only as a compatibility adapter if existing clients require it.
- [ ] Enforce reviewer assignment, submission-to-task matching, `PENDING` status, and one current reviewable submission.
- [ ] Make submit transition conditional on current `IN_PROGRESS` state to avoid duplicate concurrent submissions; return the created submission ID.
- [ ] Add outbox rows for submit and review events in the same transactions as task/submission changes.
- [ ] Run task submission unit/integration tests until green.

### Task 5: Add notification consumers for submission lifecycle

**Files:**
- Modify: `backend/apps/notification-service/src/notifications/notification-events.consumer.ts`
- Modify: `backend/apps/notification-service/test/notification-messaging.integration.spec.ts`

- [ ] Subscribe to `TASK_SUBMITTED` and `TASK_REVIEWED`.
- [ ] Notify the assigned reviewer on submit and the submission author on review, selecting a distinct notification type for `NEED_REVISION`.
- [ ] Preserve consumed-event idempotency and preference handling.
- [ ] Add integration assertions for recipient, notification type, and duplicate suppression.

### Task 6: Add task-scoped document grant management

**Files:**
- Modify: `backend/apps/permission-service/src/permissions/permissions.controller.ts`
- Modify: `backend/apps/permission-service/src/permissions/permission.service.ts`
- Modify: `backend/apps/document-management-service/src/permissions/permission.client.ts`
- Modify: `backend/apps/document-management-service/src/tasks/task-documents.controller.ts`
- Modify: `backend/apps/document-management-service/src/tasks/task-documents.service.ts`
- Modify: `backend/apps/document-management-service/test/task-documents.controller.spec.ts`
- Modify: `backend/apps/document-management-service/test/task-documents.service.spec.ts`

- [ ] Add internal permission-service operations to update a grant's permissions/expiry and revoke one grant, preserving delegation constraints and effective task-deadline expiry.
- [ ] Add task-document endpoints to list grants for one association, update one grant, and revoke one grant.
- [ ] Require the existing document-share authority and direct task participation; do not make task creator a document owner implicitly.
- [ ] Keep parent/child task-document associations independent and test a document attached to a child task.
- [ ] Run focused document/permission tests until green.

### Task 7: Full verification

**Files:**
- No production files; inspect all changed files and tests.

- [ ] Run focused task authorization/submission tests.
- [ ] Run focused document grant and notification tests.
- [ ] Run backend typecheck/build/lint and the relevant e2e suites.
- [ ] Run `git diff --check`, inspect `git diff`, and report any remaining warnings honestly.
