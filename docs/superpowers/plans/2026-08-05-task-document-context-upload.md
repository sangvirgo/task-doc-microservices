# Task-Document Context Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make task-context document uploads create an explicit TaskDocument association and task-scoped grants while preserving independent documents and per-task isolation.

**Architecture:** Keep `Document` independent and retain the existing many-to-many `TaskDocument` join. Extend the multipart upload contract with optional `task_id` and an explicit JSON `grants` list; when both are present, the document controller delegates association and grant creation to the existing `TaskDocumentsService`. Independent uploads remain unassociated, but the authenticated owner can find them in the safe owner inventory; content metadata and download still require an explicit grant.

**Tech Stack:** NestJS, TypeScript, Zod, Prisma, Jest, Supertest, Postman collection JSON.

---

### Task 1: Add failing contract tests for task-context multipart upload

**Files:**
- Modify: `backend/apps/document-management-service/test/document-upload.integration.spec.ts`
- Test: the existing PostgreSQL-backed upload integration suite

- [ ] **Step 1: Add a test proving an independent upload creates no TaskDocument row.**

Keep the existing independent upload test and add `expect(await prisma.taskDocument.count()).toBe(0)` after the document/version assertions.

- [ ] **Step 2: Add a failing test for upload with `task_id` and explicit grants.**

Submit multipart fields `task_id` and `grants` where `grants` is a JSON array containing a direct assignee with `PREVIEW` and `DOWNLOAD`. Mock the task context and permission grant endpoints, then assert the response contains `association.task_id`, `association.document_id`, and `grants`, and that Prisma contains one matching TaskDocument row.

- [ ] **Step 3: Add a failing test rejecting task-context upload without explicit grants.**

Submit `task_id` without `grants`, expect HTTP 400, and assert no document or TaskDocument row was created.

- [ ] **Step 4: Run the focused suite and verify the new tests fail for the missing contract.**

Run:

```bash
pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/document-management-service/test/document-upload.integration.spec.ts
```

Expected: the independent test passes, while task-context tests fail because upload currently ignores `task_id`/`grants` and returns no association.

### Task 2: Implement task-context upload orchestration

**Files:**
- Modify: `backend/apps/document-management-service/src/documents/documents.controller.ts`
- Modify: `backend/apps/document-management-service/src/tasks/task-documents.service.ts` only if the existing attach result type needs a reusable import

- [ ] **Step 1: Parse optional multipart task context and explicit grants.**

Add Zod parsing for optional `task_id` and a JSON-encoded `grants` array. Require both fields together; reject `task_id` without grants and grants without `task_id` before security processing.

- [ ] **Step 2: Inject the existing TaskDocumentsService into DocumentsController.**

Do not duplicate task validation, participant checks, grant validation, audit, or compensation. Reuse `TaskDocumentsService.attach` after the uploaded Document and Version are created.

- [ ] **Step 3: Return association and grant data only for task-context uploads.**

Independent uploads keep the current `{ document, version }` shape. Task-context uploads return `{ document, version, association, grants }`.

- [ ] **Step 4: Run the focused upload suite and verify all upload tests pass.**

Run the command from Task 1 and confirm the independent upload, task-context upload, malformed-contract, state-secret, and downstream-failure cases all pass.

### Task 3: Preserve and prove per-task permission isolation

**Files:**
- Modify: `backend/apps/document-management-service/test/task-documents.service.spec.ts` if additional coverage is needed
- Modify: `backend/apps/document-management-service/test/document-upload.integration.spec.ts` for integration assertions

- [ ] **Step 1: Add a failing regression test for the same Document attached to two Tasks.**

Use two task contexts and two grant calls, assert both TaskDocument associations exist, and assert each grant carries its own `task_id`.

- [ ] **Step 2: Add a failing regression test for detaching one Task.**

Detach only Task A and assert the Task A association/revocation call is targeted to Task A while the Task B association/grant remains untouched.

- [ ] **Step 3: Run the task-document service/controller suites and verify the new tests fail before implementation changes.**

Run:

```bash
pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/document-management-service/test/task-documents.service.spec.ts apps/document-management-service/test/task-documents.controller.spec.ts
```

- [ ] **Step 4: Keep the existing attach compensation behavior green.**

When any grant creation fails, the association and already-created task grants are compensated; the Document itself remains an independent artifact and is not deleted.

### Task 4: Align the Postman workflow with the contract

**Files:**
- Modify: `docs/c17-api-postman-collection.json`

- [ ] **Step 1: Document the two upload modes.**

Keep the standalone upload example independent. Add a task-context multipart example with `task_id` and JSON `grants`, and assert the response contains the association and task-scoped grants.

- [ ] **Step 2: Separate owner inventory from content access.**

`GET /documents?owner_id={{empId}}` should find the freshly uploaded owner document without implying content access. `GET /documents/:id` and version/preview reads remain denied until `PREVIEW` is granted. Keep shared-document listing under `GET /tasks/:taskId/documents`.

- [ ] **Step 3: Keep download ordering explicit.**

Create a download ticket with `task_id` and version before redeeming it; assert redeem uses the returned ticket ID and the same Document/Version.

### Task 5: Verify the complete local backend change

**Files:**
- No additional files

- [ ] **Step 1: Run focused document tests.**

```bash
pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/document-management-service/test/document-upload.integration.spec.ts apps/document-management-service/test/task-documents.service.spec.ts apps/document-management-service/test/task-documents.controller.spec.ts
```

- [ ] **Step 2: Run backend lint and formatting checks.**

```bash
pnpm backend:lint
pnpm --filter backend format:check
```

- [ ] **Step 3: Build the backend.**

```bash
pnpm --dir backend build
```

- [ ] **Step 4: Parse the Postman collection and inspect only the intended diff.**

```bash
node --input-type=module -e "JSON.parse(await (await import('node:fs/promises')).readFile('docs/c17-api-postman-collection.json','utf8')); console.log('postman-json-ok')"
git diff --check
git status --short
```
