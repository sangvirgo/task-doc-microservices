# Task Detail Drawer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the frontend task detail into a focused dark drawer-like flow where direct sub-tasks stay inside the parent view and every child opens the same detail route recursively with visible parent context.

**Architecture:** Keep the existing `/tasks/[id]` route and API clients. `TaskDetail` will load the current task and its direct parent context, `TaskChildren` will render only direct child navigation rows, and `TaskDocuments` will remain the security boundary for task documents while its presentation is restyled. Existing workflow, activity, and official comments operations will be rearranged into the new vertical flow without adding endpoints or fields.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS Modules, Vitest, React Testing Library, existing `tasksApi`/`documentsApi` clients.

---

### Task 1: Add failing coverage for parent context and recursive child links

**Files:**
- Modify: `frontend/web/tests/task-subtask.test.tsx`
- Create: `frontend/web/tests/task-detail-hierarchy.test.tsx`

- [ ] **Step 1: Add a child-task fixture with a parent lookup response.**

Use a child task with `parent_task_id: 'parent-task-id'` and return the parent from the
second `tasksApi.get` call. The test mock must expose `children` and avoid mocking a new API.

```tsx
const childTask = { ...parentTask, id: 'child-task-id', title: 'Kiểm tra phụ lục', parent_task_id: parentTask.id };

mocks.get
  .mockResolvedValueOnce(childTask)
  .mockResolvedValueOnce(parentTask);
```

- [ ] **Step 2: Write the parent-context test.**

Render `TaskDetail` with the child id and assert the parent title is visible and links to
`/tasks/parent-task-id`, while the child title remains the main heading.

```tsx
render(<TaskDetail id={childTask.id} />);
expect(await screen.findByRole('heading', { name: childTask.title })).toBeInTheDocument();
expect(screen.getByRole('link', { name: parentTask.title })).toHaveAttribute('href', `/tasks/${parentTask.id}`);
```

- [ ] **Step 3: Write the direct-child navigation test.**

Mock `tasksApi.children(parentTask.id)` with one child, render the parent, and assert the
child appears as a link to `/tasks/child-task-id`. Assert no child document endpoint is
required by the new tree view.

```tsx
expect(screen.getByRole('link', { name: childTask.title })).toHaveAttribute('href', `/tasks/${childTask.id}`);
expect(mocks.children).toHaveBeenCalledWith(parentTask.id);
```

- [ ] **Step 4: Run the focused tests and verify they fail.**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/task-subtask.test.tsx tests/task-detail-hierarchy.test.tsx
```

Expected: FAIL because the current detail has no parent-context request/markup and the
current tree still renders nested document branches instead of the compact direct-child link
contract.

### Task 2: Implement parent context and compact recursive child navigation

**Files:**
- Modify: `frontend/web/src/features/tasks/task-detail.tsx`
- Modify: `frontend/web/src/features/tasks/task-children.tsx`
- Modify: `frontend/web/src/features/tasks/task-children.module.css`
- Modify: `frontend/web/src/types/task.ts` only if the existing API response needs a typed
  optional child summary field; do not add fields to the backend contract

- [ ] **Step 1: Add a parent-context state to `TaskDetail`.**

When the loaded direct task has `parent_task_id`, call `tasksApi.get(parent_task_id)` in the
same load lifecycle. Store `Task | AncestorTaskSummary | null`, ignore parent-load failure,
and reset it when the route id changes. Continue rendering the current task if only the
parent call fails.

- [ ] **Step 2: Render a breadcrumb and compact parent marker.**

Render `Công việc` → parent title/id → current task title above the task title. Link the
parent segment only when the response contains an `id`; otherwise render a non-link summary
label. The current task remains the only `h1`.

- [ ] **Step 3: Reduce `TaskChildren` to direct children.**

Load only `tasksApi.children(parentId)`. Render each child as a compact row with a status
badge, deadline/overdue label, and `Link href={`/tasks/${child.id}`}`. Keep the section inside
the current parent detail and show a quiet empty state only when the API returns no children.
Do not load child documents or recursively fetch the entire tree from this component; clicking
the child route is the recursion mechanism and preserves document/comment authorization.

- [ ] **Step 4: Replace the tree CSS with drawer-friendly child-row styles.**

Use a dark-compatible compact list: one row per child, subtle separators, truncated title,
status pill, and a right-facing navigation affordance. Keep responsive behavior to one
column and preserve the existing error/retry state.

- [ ] **Step 5: Run the focused hierarchy tests and verify they pass.**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/task-subtask.test.tsx tests/task-detail-hierarchy.test.tsx
```

Expected: PASS, including parent context, direct child link, and participant-created child
task coverage.

### Task 3: Recompose task detail into the focused drawer layout

**Files:**
- Modify: `frontend/web/src/features/tasks/task-detail.tsx`
- Modify: `frontend/web/src/features/tasks/task-detail.module.css`
- Modify: `frontend/web/src/features/tasks/task-documents.tsx` only where markup must expose
  existing attachment actions in the compact layout
- Modify: `frontend/web/src/features/tasks/task-documents.module.css`

- [ ] **Step 1: Replace the two-column page/side-rail composition.**

Use one focused column with this order:

1. top action bar and parent breadcrumb;
2. title, status, assignee, deadline, task-list/description rows;
3. direct sub-task section;
4. task documents/attachments;
5. actionable submit/review workflow only when current permission/status allows it;
6. activity summary inside the task;
7. official comments link;
8. secondary block/cancel/participant actions in an overflow/secondary area.

Keep all existing API calls and guards: `canSubmit`, `canReview`, `canCreateSubtask`,
`canCancelTask`, participant assignment, block/unblock, and cancellation via
`tasksApi.status(..., 'CANCELLED')`.

- [ ] **Step 2: Use CSS Modules to create the dark drawer visual hierarchy.**

Define explicit classes for the drawer shell, top bar, metadata row, status pill, parent
context, compact child section, attachment grid, activity section, comment composer/link,
workflow forms, and responsive breakpoints. Use the reference's dark neutral background,
thin borders, muted labels, compact spacing, and blue/green/red status accents. Do not add a
new icon dependency; use existing text/icon characters or current project primitives.

- [ ] **Step 3: Make the attachment section compact without bypassing document security.**

Keep `documentsApi.taskDocuments(task.id)` as the source of items. Preserve checks before
preview/download/detach and preserve the upload form's existing grants and task id. Change
only visual grouping and labels so files read as attachment cards like the reference image.

- [ ] **Step 4: Keep activity and comments inside the task boundary.**

Render activity from `tasksApi.activity(task.id)` in a compact timeline. Keep comments out of
the global page and link to `/tasks/${task.id}/comments` using the existing task comments API.

- [ ] **Step 5: Run the existing task tests.**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/task-subtask.test.tsx tests/task-detail-hierarchy.test.tsx tests/task-workflow.test.tsx tests/task-comments.test.tsx tests/task-documents-loading.test.tsx tests/task-document-permissions.test.tsx
```

Expected: PASS with no unhandled React or browser errors.

### Task 4: Update regression coverage for the new visual structure

**Files:**
- Modify: `frontend/web/tests/task-workflow.test.tsx`
- Modify: `frontend/web/tests/task-comments.test.tsx` only if selectors depend on old section markup
- Modify: `frontend/web/tests/task-subtask.test.tsx`
- Modify: `frontend/web/tests/app-shell.test.tsx` only if the new drawer changes navigation links

- [ ] **Step 1: Assert workflow visibility remains permission-aware.**

Keep tests that an assignee sees submit only for `IN_PROGRESS` and the configured reviewer
sees review only for `WAITING_REVIEW`. Assert terminal tasks do not expose child creation.

- [ ] **Step 2: Assert official comments remain task-scoped.**

Keep the existing official comments route test and assert the detail page's comments link
contains the current task id.

- [ ] **Step 3: Assert the parent marker never leaks parent content.**

For an ancestor-summary parent response, assert only the title/status summary is rendered;
do not render parent comments, activity, documents, or participant controls.

- [ ] **Step 4: Run the complete frontend test suite.**

Run:

```bash
pnpm --dir frontend/web test
```

Expected: all existing and new tests pass with zero unhandled errors.

### Task 5: Verify, review, and hand off

**Files:**
- No source changes expected unless verification exposes a concrete issue.

- [ ] **Step 1: Run frontend lint.**

```bash
pnpm --dir frontend/web lint
```

Expected: exit code 0.

- [ ] **Step 2: Run TypeScript validation.**

```bash
pnpm --dir frontend/web typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Run the production build.**

```bash
pnpm --dir frontend/web build
```

Expected: Next.js build succeeds and retains `/tasks/[id]` and `/tasks/[id]/comments`.

- [ ] **Step 4: Check the diff and local worktree.**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; do not stage or modify unrelated `.gitignore`, `.superpowers/`,
or pre-existing docs changes.

- [ ] **Step 5: Commit the implementation.**

```bash
git add frontend/web/src/features/tasks frontend/web/src/types/task.ts frontend/web/tests
git commit -m "feat: redesign task detail drawer"
```

Only stage files changed for this feature.
