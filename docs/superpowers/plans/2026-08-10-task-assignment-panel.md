# Task Assignment Side Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Lark-like task-assignment side panel that creates valid tasks with optional assignees, creator-default reviewers, explicit reviewer selection, and backend-enforced no-self-review rules.

**Architecture:** Extend the existing task-create contract so assignee and reviewer are persisted atomically. Extract one reusable React drawer for the task-list and permitted subtask entry points; keep task documents and subtasks as post-creation actions so the UI never offers a child-task flow that the parent-assignee rule will reject.

**Tech Stack:** NestJS, Zod, Prisma, Jest/Supertest, Next.js, React, TypeScript, CSS Modules, Vitest, React Testing Library, Playwright.

---

## Scope and file map

### Backend

- Modify `backend/apps/task-management-service/src/tasks/tasks.controller.ts`: accept and validate optional `reviewer_id` on create; validate explicit reviewers as employees; preserve creator-only mutation authorization.
- Modify `backend/apps/task-management-service/src/tasks/tasks.service.ts`: persist the effective reviewer in the create transaction and reject assignee/reviewer conflicts on create, assignment, and reviewer changes.
- Modify `backend/apps/task-management-service/test/task-authorization.integration.spec.ts`: cover the HTTP contract, authorization, defaulting, participant creation, and conflict responses.
- Modify `backend/apps/task-management-service/test/tasks.service.spec.ts`: cover service-level conflict behavior without HTTP dependencies.
- Modify `backend/apps/task-management-service/test/task-outbox.integration.spec.ts`: update any self-assignment fixture that would now violate the no-self-review rule and assert the task-created payload remains compatible.

### Frontend

- Modify `frontend/web/src/types/task.ts`: add `reviewer_id` to `CreateTaskInput`.
- Modify `frontend/web/src/api/tasks.ts`: send `reviewer_id` in `tasksApi.create`.
- Create `frontend/web/src/features/tasks/task-assignment-drawer.tsx`: shared drawer shell, core fields, defaults, validation, keyboard behavior, and submission state.
- Create `frontend/web/src/features/tasks/task-assignment-drawer.module.css`: drawer-specific layout and field/error styles without coupling the component to list/detail page styles.
- Modify `frontend/web/src/features/tasks/task-list.tsx`: use the shared drawer for top-level tasks, remove inline nested-subtask/document creation from the initial form, and refresh the list after creation.
- Modify `frontend/web/src/features/tasks/task-detail.tsx`: replace the inline subtask form with the shared drawer and gate its trigger by the parent-assignee rule.
- Keep `frontend/web/src/features/tasks/recursive-subtask-editor.tsx` unchanged until the integration is complete; delete it only after references are removed and the final search confirms it is unused.
- Modify `frontend/web/tests/task-create-documents.test.tsx`: cover the new top-level drawer payload and optional assignee behavior; move document-upload assertions to the existing task-document tests if the old inline upload section is removed.
- Modify `frontend/web/tests/task-subtask.test.tsx`: cover the permitted subtask drawer and denied/hidden entry point.
- Create `frontend/web/tests/task-assignment-drawer.test.tsx`: unit-test defaults, conflict validation, labels, and failure state independently from page loading.

### API fixture/documentation

- Modify `docs/c17-api-postman-collection.json` only if the existing create-task request is still present in the tracked collection: add `reviewer_id` to its example and document that omission defaults to the creator. Do not stage the design spec or plan in implementation commits.

## Task 1: Add failing backend authorization tests

**Files:**

- Test: `backend/apps/task-management-service/test/task-authorization.integration.spec.ts`
- Test: `backend/apps/task-management-service/test/tasks.service.spec.ts`
- Test: `backend/apps/task-management-service/test/task-outbox.integration.spec.ts`

- [ ] **Step 1: Add the HTTP contract test for creator-default review.**

Add a test beside the existing task-creation tests that posts only `title` and `assignee_id`, then asserts `201`, `status: 'ASSIGNED'`, and `reviewer_id` equal to the authenticated creator. The request body should be:

```ts
const response = await request(app.getHttpServer())
  .post('/tasks')
  .set(authHeaders(EMPLOYEE_ID))
  .send({ title: 'Creator reviews by default', assignee_id: SECOND_EMPLOYEE_ID });

expect(response.status).toBe(201);
expect(response.body).toMatchObject({
  status: 'ASSIGNED',
  assignee_id: SECOND_EMPLOYEE_ID,
  reviewer_id: EMPLOYEE_ID,
});
```

- [ ] **Step 2: Add the HTTP contract test for an explicit reviewer.**

Post a task with `assignee_id: SECOND_EMPLOYEE_ID` and `reviewer_id: THIRD_EMPLOYEE_ID`. Assert the response reviewer and the participants endpoint contain the reviewer with role `REVIEWER`.

- [ ] **Step 3: Add failing conflict tests for all three write paths.**

Add tests that expect `400` and an error containing `reviewer`/`assignee` when:

```ts
await request(app.getHttpServer())
  .post('/tasks')
  .set(authHeaders(EMPLOYEE_ID))
  .send({
    title: 'No self review',
    assignee_id: SECOND_EMPLOYEE_ID,
    reviewer_id: SECOND_EMPLOYEE_ID,
  });

await request(app.getHttpServer())
  .post(`/tasks/${taskId}/assign`)
  .set(authHeaders(EMPLOYEE_ID))
  .send({ assignee_id: currentReviewerId });

await request(app.getHttpServer())
  .put(`/tasks/${taskId}/reviewer`)
  .set(authHeaders(EMPLOYEE_ID))
  .send({ reviewer_id: currentAssigneeId });
```

- [ ] **Step 4: Add service-level tests for the conflict helper.**

Use the existing mocked Prisma setup in `tasks.service.spec.ts`. Assert `tasksService.assignTask` and `tasksService.assignReviewer` reject with `BadRequestException` before the transaction callback is invoked when the effective reviewer and assignee are equal.

- [ ] **Step 5: Run the focused tests and confirm they fail for the missing behavior.**

Run:

```bash
NODE_ENV=test pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/task-management-service/test/task-authorization.integration.spec.ts apps/task-management-service/test/tasks.service.spec.ts
```

Expected: the new reviewer-create assertion fails because `reviewer_id` is not accepted/persisted, and the conflict tests fail because the current service accepts the same user.

## Task 2: Implement the atomic backend contract and rules

**Files:**

- Modify: `backend/apps/task-management-service/src/tasks/tasks.controller.ts:43-75,181-221`
- Modify: `backend/apps/task-management-service/src/tasks/tasks.service.ts:183-259,385-411,459-514`
- Test: `backend/apps/task-management-service/test/task-authorization.integration.spec.ts`
- Test: `backend/apps/task-management-service/test/tasks.service.spec.ts`
- Test: `backend/apps/task-management-service/test/task-outbox.integration.spec.ts`

- [ ] **Step 1: Extend the create schema and controller call.**

Add `reviewer_id: z.string().uuid().nullable().optional()` to `createTaskSchema`. Before calling the service, validate a non-null explicit reviewer with the existing `userRoleClient.assertEmployee(parsed.data.reviewer_id)`. Pass the field through the service call:

```ts
if (parsed.data.reviewer_id) {
  await this.userRoleClient.assertEmployee(parsed.data.reviewer_id);
}

return this.tasksService.createTask({
  title: parsed.data.title,
  description: parsed.data.description,
  creator_id: user.userId,
  assignee_id: parsed.data.assignee_id,
  reviewer_id: parsed.data.reviewer_id,
  parent_task_id: parsed.data.parent_task_id,
  deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
  correlation_id: getCorrelationId() ?? randomUUID(),
});
```

- [ ] **Step 2: Add a service-level distinctness helper.**

Add this private helper near `assertCreator`:

```ts
private assertDistinctAssigneeAndReviewer(
  assigneeId: string | null | undefined,
  reviewerId: string | null | undefined,
): void {
  if (assigneeId && reviewerId && assigneeId === reviewerId) {
    throw new BadRequestException('The assignee and reviewer must be different users');
  }
}
```

- [ ] **Step 3: Persist the effective reviewer during task creation.**

Add `reviewer_id?: string | null` to the `createTask` input, calculate `const reviewerId = data.reviewer_id ?? data.creator_id`, call the distinctness helper before the transaction, and write `reviewer_id: reviewerId` to `tx.task.create`.

When the effective reviewer differs from the creator, upsert a `REVIEWER` participant in the same transaction. Keep the existing creator and assignee participant behavior. The transaction must therefore create the task, creator participant, assignee participant when applicable, reviewer participant when applicable, and task-created outbox event as one unit.

- [ ] **Step 4: Enforce the conflict on later assignment changes.**

At the start of `assignReviewer`, after loading the task and checking the creator, call:

```ts
this.assertDistinctAssigneeAndReviewer(task.assignee_id, reviewer_id);
```

At the start of `assignTask`, after loading the task, call:

```ts
this.assertDistinctAssigneeAndReviewer(
  assignee_id,
  task.reviewer_id ?? task.creator_id,
);
```

The controller’s existing employee validation remains in place for both target users. No database migration is needed because `Task.reviewer_id` already exists.

- [ ] **Step 5: Update incompatible fixtures without weakening the rule.**

If `task-outbox.integration.spec.ts` creates a task with `creator_id === assignee_id` and no alternate reviewer, change that fixture to use `SECOND_EMPLOYEE_ID` as the assignee while leaving the creator as the default reviewer. Preserve all event assertions unrelated to assignment.

- [ ] **Step 6: Run the focused backend tests and confirm they pass.**

Run:

```bash
NODE_ENV=test pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/task-management-service/test/task-authorization.integration.spec.ts apps/task-management-service/test/tasks.service.spec.ts apps/task-management-service/test/task-outbox.integration.spec.ts
```

Expected: all existing and new task authorization/service/outbox tests pass.

## Task 3: Update the frontend API/types and add the drawer unit-test contract

**Files:**

- Modify: `frontend/web/src/types/task.ts:12`
- Modify: `frontend/web/src/api/tasks.ts:8`
- Create: `frontend/web/tests/task-assignment-drawer.test.tsx`

- [ ] **Step 1: Extend the frontend create input.**

Change the type to:

```ts
export interface CreateTaskInput {
  title: string;
  description?: string;
  assignee_id?: string;
  reviewer_id?: string | null;
  parent_task_id?: string;
  deadline?: string;
}
```

- [ ] **Step 2: Add the drawer test fixtures and failing behavior tests.**

Mock `@/api/admin` only where the component loads directory data; keep the drawer test focused on props and callbacks. Add tests for:

```tsx
it('defaults reviewer to the current user and allows an unassigned task', async () => {
  render(<TaskAssignmentDrawer currentUserId="creator-id" members={members} onSubmit={onSubmit} onClose={onClose} />);

  expect(screen.getByRole('combobox', { name: 'Người review' })).toHaveValue('creator-id');
  expect(screen.getByRole('button', { name: 'Tạo task' })).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Tiêu đề công việc'), { target: { value: 'Task A' } });
  fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Task A',
    reviewer_id: 'creator-id',
  })));
  expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('assignee_id');
});

it('blocks self-review when assignee equals reviewer', () => {
  render(<TaskAssignmentDrawer currentUserId="creator-id" members={members} onSubmit={onSubmit} onClose={onClose} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Người được giao' }), { target: { value: 'reviewer-id' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Người review' }), { target: { value: 'reviewer-id' } });
  expect(screen.getByText(/khác nhau/i)).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the new frontend test to verify it fails before the component exists.**

Run:

```bash
pnpm --dir frontend/web test -- task-assignment-drawer.test.tsx
```

Expected: FAIL because `TaskAssignmentDrawer` has not been created.

- [ ] **Step 4: Update `tasksApi.create` to accept and send `reviewer_id`.**

Keep the existing `tasksApi.create(input)` signature and rely on the expanded `CreateTaskInput`; no new endpoint is required. Add an API contract assertion in the drawer/page test that the callback receives the reviewer ID.

## Task 4: Implement the shared Lark-like drawer

**Files:**

- Create: `frontend/web/src/features/tasks/task-assignment-drawer.tsx`
- Create: `frontend/web/src/features/tasks/task-assignment-drawer.module.css`
- Test: `frontend/web/tests/task-assignment-drawer.test.tsx`

- [ ] **Step 1: Define the component boundary.**

Use a controlled component with this public contract:

```tsx
export interface TaskAssignmentDrawerProps {
  currentUserId: string;
  members: MemberOption[];
  parentTask?: { id: string; title: string };
  submitting?: boolean;
  error?: string;
  onSubmit: (input: CreateTaskInput, form: HTMLFormElement) => void | Promise<void>;
  onClose: () => void;
}
```

The component owns only form state and accessibility behavior. Task-list/detail pages own API calls, cache refresh, document navigation, notices, and page-specific post-create work.

- [ ] **Step 2: Implement field defaults and validation.**

Initialize `reviewer_id` to `currentUserId`, leave `assignee_id` empty, and render the parent context read-only when `parentTask` exists. Use the existing `SearchableSelect` for both people fields. Filter the assignee options so the current user is not offered as an assignee while keeping the current user available in reviewer options.

Compute the conflict exactly as:

```ts
const hasReviewerConflict = Boolean(
  draft.assignee_id && draft.assignee_id === draft.reviewer_id,
);
```

Prevent submit when the title is blank or `hasReviewerConflict` is true. Show the conflict message beside both person fields. Convert a non-empty `datetime-local` value to `new Date(value).toISOString()` before calling `onSubmit`.

- [ ] **Step 3: Implement user-facing states.**

Use `Tạo task` when `assignee_id` is empty and `Giao task` otherwise. Show helper text explaining `CREATED`/`Chưa giao` for an empty assignee. Disable the close/cancel controls while submitting, move focus to the title on open, and use `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.

Keep the drawer open on errors. Render the supplied `error` near the form and preserve all values. Do not auto-resubmit after a network or `5xx` error.

- [ ] **Step 4: Add component styles.**

Implement the right-side drawer, backdrop, sticky footer, two-column desktop field grid, single-column narrow layout, visible error state, and loading state in `task-assignment-drawer.module.css`. Do not copy page-specific selectors from `tasks.module.css` or `task-detail.module.css`.

- [ ] **Step 5: Run the drawer tests and frontend typecheck.**

Run:

```bash
pnpm --dir frontend/web test -- task-assignment-drawer.test.tsx
pnpm --dir frontend/web typecheck
```

Expected: the drawer tests pass and TypeScript reports no errors from the new component or expanded input type.

## Task 5: Integrate the drawer into the task list without violating parent-task rules

**Files:**

- Modify: `frontend/web/src/features/tasks/task-list.tsx:27-158,178-209`
- Modify: `frontend/web/src/features/tasks/tasks.module.css`
- Modify: `frontend/web/tests/task-create-documents.test.tsx`
- Delete only after reference search: `frontend/web/src/features/tasks/recursive-subtask-editor.tsx`

- [ ] **Step 1: Replace the top-level composer core with `TaskAssignmentDrawer`.**

Pass `currentUserId={readSession()?.userId ?? ''}` and the loaded `members`. On submit, call:

```tsx
const created = await tasksApi.create(input);
setItems(current => current ? [created, ...current] : current);
setComposerOpen(false);
setNotice(input.assignee_id ? 'Đã giao task.' : 'Đã tạo task ở trạng thái Chưa giao.');
```

Keep the existing list refresh fallback if the current page has server-side pagination or filters that make insertion unsafe.

- [ ] **Step 2: Remove initial inline subtask creation.**

Do not render `RecursiveSubtaskEditor` from the top-level drawer. A parent task may be assigned to another employee, while the backend only permits the parent assignee to create children. Leave the task-list form with one valid parent task and direct the user to the task detail after creation for subtasks.

Before deleting `recursive-subtask-editor.tsx`, run:

```bash
rg -n "RecursiveSubtaskEditor|createBlankSubtask|SubtaskDraft" frontend/web
```

If only the task-list references remain, remove those imports/state paths and delete the now-unused component. Keep any shared CSS only if another component still uses it.

- [ ] **Step 3: Move document attachment out of the create request.**

The create drawer must not require an assignee merely because files were selected. Remove the `files`, `uploading`, `expires_at`, grant, and upload orchestration from the initial create flow. After the task is created, show a success action linking to `/tasks/${created.id}` where `TaskDocuments` remains responsible for attaching documents to the task ID.

This preserves document functionality while allowing unassigned tasks and avoiding a half-created task plus half-uploaded attachments in one form submission.

- [ ] **Step 4: Update the list test.**

Rewrite `task-create-documents.test.tsx` or split it so the task-list test asserts:

```ts
expect(mocks.create).toHaveBeenCalledWith({
  title: 'Rà soát hồ sơ',
  reviewer_id: 'creator-id',
});
```

Add a second assertion that leaving the assignee empty uses button text `Tạo task`, creates successfully, and does not upload or create a subtask request.

- [ ] **Step 5: Run task-list tests.**

Run:

```bash
pnpm --dir frontend/web test -- task-create-documents.test.tsx
```

Expected: the updated task-list tests pass and no test references the removed inline child/document flow.

## Task 6: Integrate the drawer into task detail and gate subtask creation

**Files:**

- Modify: `frontend/web/src/features/tasks/task-detail.tsx:31-130,145-230`
- Modify: `frontend/web/src/features/tasks/task-detail.module.css`
- Modify: `frontend/web/tests/task-subtask.test.tsx`

- [ ] **Step 1: Derive the parent-assignee permission in `DirectTask`.**

Use the existing session and task data:

```ts
const currentUserId = readSession()?.userId;
const canCreateSubtask = Boolean(currentUserId && currentUserId === task.assignee_id);
```

If `canCreateSubtask` is false, render the subtask action disabled with helper text `Chỉ người được giao task cha mới có thể tạo subtask.` Do not render an active form for ancestor-summary tasks.

- [ ] **Step 2: Replace the inline subtask form with the shared drawer.**

Open `TaskAssignmentDrawer` with `parentTask={{ id: task.id, title: task.title }}`. Submit with `tasksApi.create({ ...input, parent_task_id: task.id })`, close only after success, reload the task detail/tree, and show a success notice. Remove `subtaskFiles`, the inline upload loop, and the `creatingSubtask` form-specific code; document attachment remains available in `TaskDocuments` for the created child.

- [ ] **Step 3: Preserve existing assignee/reviewer rules in detail actions.**

Keep the existing creator-only assignee form, but add the same no-self-review validation message from the backend response. The detail page’s review tab must continue to use `task.reviewer_id ?? task.creator_id` and must not grant review capability to an assignee merely because they can submit.

- [ ] **Step 4: Update the detail test fixtures and assertions.**

Set the parent task’s assignee to the current session user in the permitted test and assert the child request contains:

```ts
expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
  title: 'Kiểm tra phụ lục',
  parent_task_id: parentTask.id,
  reviewer_id: 'creator-id',
}));
```

Add a test with a different current user that finds the disabled subtask action and asserts `mocks.create` is not called when it is clicked.

- [ ] **Step 5: Run detail/subtask tests.**

Run:

```bash
pnpm --dir frontend/web test -- task-subtask.test.tsx
```

Expected: permitted parent-assignee creation passes; non-assignee cannot open or submit the subtask drawer.

## Task 7: Update API examples and run the complete verification matrix

**Files:**

- Modify: `docs/c17-api-postman-collection.json` only for the create-task example if required.
- Test: all files changed in Tasks 1, 3, 5, and 6.

- [ ] **Step 1: Update the Postman create-task example without adding a new endpoint.**

Add `reviewer_id` to the request body example and a description stating that omission defaults to the creator. Add a note that `assignee_id` may be omitted, while `assignee_id === reviewer_id` is rejected with `400`.

- [ ] **Step 2: Run focused backend verification.**

Run:

```bash
NODE_ENV=test pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/task-management-service/test/task-authorization.integration.spec.ts apps/task-management-service/test/tasks.service.spec.ts apps/task-management-service/test/task-outbox.integration.spec.ts
```

Expected: all focused task tests pass.

- [ ] **Step 3: Run focused frontend verification.**

Run:

```bash
pnpm --dir frontend/web test -- task-assignment-drawer.test.tsx task-create-documents.test.tsx task-subtask.test.tsx
pnpm --dir frontend/web typecheck
pnpm --dir frontend/web lint
```

Expected: all selected Vitest suites pass, typecheck passes, and ESLint reports no errors.

- [ ] **Step 4: Run repository-level backend checks.**

Run:

```bash
pnpm backend:lint
pnpm --dir backend format:check
pnpm --dir backend build
```

Expected: lint, format, and all backend application builds pass.

- [ ] **Step 5: Run backend end-to-end verification.**

Run:

```bash
pnpm backend:test:e2e
```

Expected: the existing e2e suite passes, including create/assign/review flows and the new conflict cases.

- [ ] **Step 6: Check the final diff and stage only implementation files.**

Run:

```bash
git diff --check
git status --short
```

Do not stage `docs/superpowers/specs/2026-08-10-task-assignment-panel-design.md` or `docs/superpowers/plans/2026-08-10-task-assignment-panel.md`, per the user’s instruction. Create implementation commits containing only backend/frontend source, tests, and the Postman collection if it was changed.

## Completion criteria

- A creator can open the same right-side drawer from the task list and permitted task detail.
- An unassigned task can be created and is clearly shown as `Chưa giao`/`CREATED`.
- Reviewer defaults to creator and can be changed to another employee.
- Backend rejects assignee/reviewer self-review on create and later assignment changes.
- Subtask creation is unavailable to non-assignees and succeeds for the parent assignee.
- Document attachment remains available after a task has a stable ID.
- Focused tests, frontend checks, backend checks, build, and e2e verification pass.
