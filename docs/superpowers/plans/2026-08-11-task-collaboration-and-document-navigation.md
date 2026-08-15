# Task Collaboration and Document Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Lark-like task detail collaboration view, visible child tree and participant context, paginated comments/timeline, actionable notification details, and task-grouped permission-aware document workflows.

**Architecture:** Preserve the existing gateway and backend authorization contracts. Add a typed paginated client method that exposes the already-supported `items`/`pagination` envelopes, then keep pagination state local to focused UI components. The task detail page composes focused people, child-tree, documents, and collaboration components; the documents page composes task-scoped document responses so permission chips come from the server rather than client guesses.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS Modules, Vitest, React Testing Library, existing NestJS gateway contracts.

---

## File Map

- Create `frontend/web/src/types/pagination.ts` for the shared page envelope.
- Modify `frontend/web/src/api/client.ts`, `tasks.ts`, `documents.ts`, and `notifications.ts` to preserve page metadata and expose page-aware methods without breaking existing list callers.
- Modify `frontend/web/src/types/task.ts`, `document.ts`, and `notification.ts` to match the existing backend DTO fields used by the new screens.
- Create `frontend/web/src/features/tasks/task-people.tsx` and `task-people.module.css` for role-labelled creator/assignee/reviewer/participant display.
- Modify `frontend/web/src/features/tasks/task-children.tsx` and its CSS to render the `Task.children` response directly and retain retry behavior when a fallback fetch is needed.
- Create `frontend/web/src/features/tasks/task-collaboration.tsx` and `task-collaboration.module.css` for comments-first tabs, composer, timeline, auto-pagination, loading, retry, and end states.
- Modify `frontend/web/src/features/tasks/task-detail.tsx`, `task-detail.module.css`, `task-comments.tsx`, and `task-comments.module.css` to compose the new components while keeping workflow actions and the direct comments route.
- Create `frontend/web/src/features/notifications/notification-detail.tsx` and `notifications-detail.module.css`; create `frontend/web/src/app/(workspace)/notifications/[id]/page.tsx`; modify notification list styles/rendering for links.
- Modify `frontend/web/src/features/documents/document-list.tsx` and `documents.module.css` to load visible tasks, group documents by task, show task-scoped permissions, and require a task on upload.
- Add focused tests under `frontend/web/tests/` for page parsing, task hierarchy/context/collaboration, notifications, and documents.

## Task 1: Add a typed pagination contract to the frontend API

**Files:**
- Create: `frontend/web/src/types/pagination.ts`
- Modify: `frontend/web/src/api/client.ts`
- Modify: `frontend/web/src/api/tasks.ts`
- Modify: `frontend/web/src/api/documents.ts`
- Modify: `frontend/web/src/api/notifications.ts`
- Test: `frontend/web/tests/pagination-api.test.ts`

- [ ] **Step 1: Write the failing page-normalization tests**

Add tests that prove a paginated envelope is preserved and the legacy list helper still returns only items:

```ts
import { expect, it } from 'vitest';
import { normalizePageForTest, normalizeListForTest } from '@/api/client';

it('normalizes the standard page envelope without losing pagination metadata', () => {
  expect(normalizePageForTest({
    items: [{ id: 'one' }],
    pagination: { page: 2, page_size: 20, total: 21, total_pages: 2, has_next: false },
  })).toEqual({
    items: [{ id: 'one' }],
    pagination: { page: 2, page_size: 20, total: 21, total_pages: 2, has_next: false },
  });
});

it('keeps getList-compatible normalization for an array payload', () => {
  expect(normalizeListForTest([{ id: 'one' }])).toEqual([{ id: 'one' }]);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/pagination-api.test.ts
```

Expected: FAIL because the page normalization helpers and page type do not exist.

- [ ] **Step 3: Add the shared page type and client helper**

Create the following type and export test-only normalization wrappers while keeping the internal request function private:

```ts
// frontend/web/src/types/pagination.ts
export interface PaginationMeta {
  page: number;
  page_size: number;
  total?: number;
  total_pages?: number;
  has_next: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}
```

In `client.ts`, add `normalizePage<T>` that accepts `{ items: unknown[], pagination: object }`, validates the items array and defaults missing `has_next` to `false`; add `getPage<T>(path)` to request and normalize it. Keep `getList` calling the existing list normalizer, and export `normalizePageForTest`/`normalizeListForTest` only if the project test style requires direct helper coverage.

- [ ] **Step 4: Add page-aware API methods**

Use explicit query parameters and leave existing methods unchanged for current callers:

```ts
const pageQuery = (page: number, pageSize = 20) => `page=${page}&page_size=${pageSize}`;

// tasksApi
listPage: (filters: Record<string, string> = {}) =>
  gatewayClient.getPage<Task>(`/tasks?${new URLSearchParams(filters)}`),
commentsPage: (id: string, page = 1, pageSize = 20) =>
  gatewayClient.getPage<TaskComment>(`/tasks/${encodeURIComponent(id)}/comments?${pageQuery(page, pageSize)}`),
activityPage: (id: string, page = 1, pageSize = 20) =>
  gatewayClient.getPage<Activity>(`/tasks/${encodeURIComponent(id)}/activity?${pageQuery(page, pageSize)}`),
childrenPage: (id: string, page = 1, pageSize = 20) =>
  gatewayClient.getPage<Task>(`/tasks?parent_task_id=${encodeURIComponent(id)}&${pageQuery(page, pageSize)}`),
```

Add these exact page-aware methods to keep call sites explicit:

```ts
// documentsApi
listPage: (page = 1, pageSize = 20) => gatewayClient.getPage<Document>(`/documents?${pageQuery(page, pageSize)}`),
taskDocumentsPage: (taskId: string, page = 1, pageSize = 20) => gatewayClient.getPage<TaskDocument>(`/tasks/${encodeURIComponent(taskId)}/documents?${pageQuery(page, pageSize)}`),

// notificationsApi
get: (id: string) => gatewayClient.get<Notification>(`/notifications/${encodeURIComponent(id)}`),
listPage: (recipientId: string, unreadOnly = false, page = 1, pageSize = 20) => gatewayClient.getPage<Notification>(`/notifications?recipient_id=${encodeURIComponent(recipientId)}${unreadOnly ? '&unread_only=true' : ''}&${pageQuery(page, pageSize)}`),
```

Ensure the existing `list`, `taskDocuments`, and notification list methods continue to return arrays through `getList`.

- [ ] **Step 5: Run the focused tests and API contract tests**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/pagination-api.test.ts tests/phase2-api-contracts.test.ts tests/phase3-api-contracts.test.ts
```

Expected: PASS, with new URLs including `page` and `page_size` only in the new page-aware methods.

- [ ] **Step 6: Commit the pagination boundary**

```bash
git add frontend/web/src/types/pagination.ts frontend/web/src/api/client.ts frontend/web/src/api/tasks.ts frontend/web/src/api/documents.ts frontend/web/src/api/notifications.ts frontend/web/tests/pagination-api.test.ts
git commit -m "feat: preserve paginated frontend responses"
```

## Task 2: Render backend child data and task participation context

**Files:**
- Modify: `frontend/web/src/types/task.ts`
- Create: `frontend/web/src/features/tasks/task-people.tsx`
- Create: `frontend/web/src/features/tasks/task-people.module.css`
- Modify: `frontend/web/src/features/tasks/task-children.tsx`
- Modify: `frontend/web/src/features/tasks/task-children.module.css`
- Modify: `frontend/web/src/features/tasks/task-detail.tsx`
- Test: `frontend/web/tests/task-detail-hierarchy.test.tsx`

- [ ] **Step 1: Add failing tests for response children and role labels**

Extend the task fixture with `children` and assert that `TaskDetail` renders a child link without calling the fallback child endpoint. Add a fixture with creator, assignee, reviewer, and participant IDs and assert visible role labels and emails from the directory.

```tsx
it('renders the children returned by GET task instead of dropping the tree', async () => {
  mocks.get.mockResolvedValue(task({
    parent_task_id: null,
    children: [{ id: 'child-1', title: 'Soạn phụ lục', status: 'ASSIGNED', creator_id: 'creator-id', assignee_id: 'employee-id', reviewer_id: 'reviewer-id', deadline: null, is_overdue: false }],
  }));
  render(<TaskDetail id="task-id" />);
  expect(await screen.findByRole('link', { name: /Soạn phụ lục/ })).toHaveAttribute('href', '/tasks/child-1');
  expect(mocks.children).not.toHaveBeenCalled();
});

it('shows creator, assignee, reviewer, and participant roles', async () => {
  // directory contains the four members and task/participants contain their IDs
  render(<TaskDetail id="task-id" />);
  expect(await screen.findByText('Người tạo')).toBeInTheDocument();
  expect(screen.getByText('Người review')).toBeInTheDocument();
  expect(screen.getByText('Người tham gia')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the hierarchy test and verify the new assertions fail**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/task-detail-hierarchy.test.tsx
```

Expected: FAIL because `Task` has no `children` field and the current detail view only renders participant initials.

- [ ] **Step 3: Align task types with `TaskDto`**

Add `TaskChildSummary` and optional aggregate fields without changing `AncestorTaskSummary`:

```ts
export interface TaskChildSummary {
  id: string;
  title: string;
  status: TaskStatus;
  creator_id: string;
  assignee_id: string | null;
  reviewer_id: string | null;
  deadline: string | null;
  is_overdue: boolean;
}

export interface Task {
  // existing fields
  completion_percentage?: number;
  child_task_count?: number;
  approved_child_task_count?: number;
  completion_color?: string;
  children?: TaskChildSummary[];
}
```

- [ ] **Step 4: Update `TaskChildren` to accept backend children**

Add `initialChildren?: TaskChildSummary[] | Task[]`. If the prop is defined, render it immediately and do not call `tasksApi.children`; if it is omitted, retain the existing fetch/retry behavior. Normalize status/deadline fields through the existing formatter and keep each item linked to `/tasks/:id`.

- [ ] **Step 5: Create the focused people component**

Implement `TaskPeople` with props `{ task, participants, members, canManage, onAddParticipant }`. Render four role rows in this order: creator, assignee, reviewer, other participants. Resolve names from `members`, fall back to the first eight characters of the ID, show initials in circular avatars, and keep the existing add-participant form available only to the creator. Do not add client-side permission grants.

- [ ] **Step 6: Compose people and children into `TaskDetail`**

Remove the standalone initials-only people row, pass `task.children` to `TaskChildren`, and place `<TaskPeople />` before the child tree. Keep the existing participant mutation and `reload` behavior so newly added participants and assignment changes refresh the role display.

- [ ] **Step 7: Run hierarchy/workflow tests and commit**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/task-detail-hierarchy.test.tsx tests/task-subtask.test.tsx tests/task-workflow.test.tsx
```

Expected: PASS.

```bash
git add frontend/web/src/types/task.ts frontend/web/src/features/tasks/task-people.tsx frontend/web/src/features/tasks/task-people.module.css frontend/web/src/features/tasks/task-children.tsx frontend/web/src/features/tasks/task-children.module.css frontend/web/src/features/tasks/task-detail.tsx frontend/web/tests/task-detail-hierarchy.test.tsx
git commit -m "feat: show task hierarchy and participation context"
```

## Task 3: Add comments-first collaboration tabs with automatic pagination

**Files:**
- Create: `frontend/web/src/features/tasks/task-collaboration.tsx`
- Create: `frontend/web/src/features/tasks/task-collaboration.module.css`
- Modify: `frontend/web/src/features/tasks/task-detail.tsx`
- Modify: `frontend/web/src/features/tasks/task-detail.module.css`
- Modify: `frontend/web/src/features/tasks/task-comments.tsx`
- Modify: `frontend/web/src/features/tasks/task-comments.module.css`
- Test: `frontend/web/tests/task-collaboration.test.tsx`
- Test: `frontend/web/tests/task-comments.test.tsx`

- [ ] **Step 1: Write failing tests for the tabs and page loading**

Mock `tasksApi.commentsPage` and `activityPage` with page envelopes. Assert comments are the default tab, switching to timeline requests activity page 1, and intersecting the sentinel requests page 2 and appends the result. Assert a failed page keeps page 1 and exposes a retry button.

```tsx
it('opens comments first and appends the next page when the sentinel intersects', async () => {
  mocks.commentsPage
    .mockResolvedValueOnce(page([comment('c1', 'Đầu tiên')], true))
    .mockResolvedValueOnce(page([comment('c2', 'Tiếp theo')], false));
  render(<TaskCollaboration taskId="task-id" members={members} />);
  expect(await screen.findByText('Đầu tiên')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Bình luận/ })).toHaveAttribute('aria-selected', 'true');
  fireIntersection('comments-load-more');
  expect(await screen.findByText('Tiếp theo')).toBeInTheDocument();
});

it('switches to timeline without losing the comments tab state', async () => {
  render(<TaskCollaboration taskId="task-id" members={members} />);
  fireEvent.click(screen.getByRole('tab', { name: /Dòng thời gian/ }));
  expect(await screen.findByText('Task updated')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Bình luận/ })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the collaboration test and verify it fails**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/task-collaboration.test.tsx
```

Expected: FAIL because the collaboration component and page-aware APIs are not implemented.

- [ ] **Step 3: Implement the comments/timeline panel**

Create `TaskCollaboration` with `activeTab: 'comments' | 'activity'`, page state per tab, a `loadPage(tab, page, replace)` function, and an `IntersectionObserver` sentinel. Use a `Map` keyed by item ID when appending. Render these accessible controls:

```tsx
<div role="tablist" aria-label="Trao đổi trong task">
  <button role="tab" aria-selected={activeTab === 'comments'}>Bình luận {commentMeta.total ?? ''}</button>
  <button role="tab" aria-selected={activeTab === 'activity'}>Dòng thời gian {activityMeta.total ?? ''}</button>
</div>
```

The comments panel includes the existing `tasksApi.comment` composer. After a successful post, reset the form and reload comments page 1. The timeline panel displays actor initials, summary, activity type, and localized timestamp. Include “Đang tải…”, “Tải thêm”, “Thử lại”, and “Đã hiển thị hết” states.

- [ ] **Step 4: Move task detail data ownership to the collaboration component**

Stop loading full comments/activity arrays in `TaskDetail.load`; keep participant loading there. Replace the stacked activity and comments sections with `<TaskCollaboration taskId={task.id} members={members} />`. Keep the workflow and document sections unchanged in this step.

- [ ] **Step 5: Reuse the paginated comments thread on the direct comments route**

Update `TaskComments` to use the same `TaskCollaboration` comments thread in comments-only mode, preserving its task context header and permission/empty states. The route must not issue an unbounded list request.

- [ ] **Step 6: Run focused task tests and commit**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/task-collaboration.test.tsx tests/task-comments.test.tsx tests/task-workflow.test.tsx
```

Expected: PASS, including existing comment posting and workflow tests.

```bash
git add frontend/web/src/features/tasks/task-collaboration.tsx frontend/web/src/features/tasks/task-collaboration.module.css frontend/web/src/features/tasks/task-detail.tsx frontend/web/src/features/tasks/task-detail.module.css frontend/web/src/features/tasks/task-comments.tsx frontend/web/src/features/tasks/task-comments.module.css frontend/web/tests/task-collaboration.test.tsx frontend/web/tests/task-comments.test.tsx
git commit -m "feat: add paginated task collaboration tabs"
```

## Task 4: Make notifications navigable and add notification detail

**Files:**
- Modify: `frontend/web/src/api/notifications.ts`
- Create: `frontend/web/src/features/notifications/notification-detail.tsx`
- Create: `frontend/web/src/features/notifications/notifications-detail.module.css`
- Modify: `frontend/web/src/features/notifications/notification-list.tsx`
- Modify: `frontend/web/src/features/notifications/notifications.module.css`
- Test: `frontend/web/tests/task-detail-hierarchy.test.tsx`
- Test: `frontend/web/tests/task-collaboration.test.tsx`
- Test: `frontend/web/tests/notifications.test.tsx`
- Test: `frontend/web/tests/document-task-grouping.test.tsx`
- Create: `frontend/web/src/app/(workspace)/notifications/[id]/page.tsx`
- Test: `frontend/web/tests/notifications.test.tsx`

- [ ] **Step 1: Write failing list/detail tests**

Assert that a notification row links to `/notifications/:id`, the detail feature calls `notificationsApi.get`, marks unread notifications read, renders metadata, and links `metadata.task_id` to `/tasks/:id`.

```tsx
it('opens notification detail from a list row', async () => {
  mocks.list.mockResolvedValue([notification({ id: 'notice-1' })]);
  render(<NotificationList />);
  expect(await screen.findByRole('link', { name: /Task assigned/ })).toHaveAttribute('href', '/notifications/notice-1');
});

it('marks an unread notification read and links its task metadata', async () => {
  mocks.get.mockResolvedValue(notification({ id: 'notice-1', read_at: null, metadata: { task_id: 'task-1', source: 'TASK_ASSIGNED' } }));
  render(<NotificationDetail id="notice-1" />);
  expect(await screen.findByRole('link', { name: /Mở task/ })).toHaveAttribute('href', '/tasks/task-1');
  await waitFor(() => expect(mocks.markRead).toHaveBeenCalledWith('notice-1'));
});
```

- [ ] **Step 2: Run the notification tests and verify they fail**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/notifications.test.tsx
```

Expected: FAIL because no detail API method, route, or clickable row exists.

- [ ] **Step 3: Add API and detail route**

Add:

```ts
get: (id: string) => gatewayClient.get<Notification>(`/notifications/${encodeURIComponent(id)}`),
listPage: (recipientId: string, unreadOnly = false, page = 1, pageSize = 20) =>
  gatewayClient.getPage<Notification>(`/notifications?recipient_id=${encodeURIComponent(recipientId)}${unreadOnly ? '&unread_only=true' : ''}&page=${page}&page_size=${pageSize}`),
```

Create the App Router page that reads `params.id` and renders `NotificationDetail`. The feature loads the notification, calls `markRead` once when `read_at` is null, and renders metadata as escaped key/value text plus target links for `task_id`, `document_id`, and `submission_id` when present.

- [ ] **Step 4: Make list rows keyboard-accessible without nested interactive controls**

Use a `Link` for the title/body area and keep the “Đánh dấu đã đọc” button as a sibling in the row footer. Add focus-visible styles, unread state styling, and a clear “Xem chi tiết” affordance. Preserve list filters and mark-all behavior.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/notifications.test.tsx tests/phase3-api-contracts.test.ts
```

Expected: PASS.

```bash
git add frontend/web/src/api/notifications.ts frontend/web/src/features/notifications/notification-detail.tsx frontend/web/src/features/notifications/notifications-detail.module.css frontend/web/src/features/notifications/notification-list.tsx frontend/web/src/features/notifications/notifications.module.css frontend/web/src/app/'(workspace)'/notifications/'[id]'/page.tsx frontend/web/tests/notifications.test.tsx
git commit -m "feat: add actionable notification details"
```

## Task 5: Group documents by task, show permissions, and require task on upload

**Files:**
- Modify: `frontend/web/src/types/document.ts`
- Modify: `frontend/web/src/features/documents/document-list.tsx`
- Modify: `frontend/web/src/features/documents/documents.module.css`
- Modify: `frontend/web/tests/task-create-documents.test.tsx`
- Create: `frontend/web/tests/document-task-grouping.test.tsx`

- [ ] **Step 1: Write failing document grouping/upload tests**

Mock two visible tasks, one task-document response with `permissions`, and one legacy document. Assert task sections, permission chips, a required task selector, and upload payload fields:

```tsx
it('groups documents by task and displays server permissions', async () => {
  mocks.tasksPage.mockResolvedValue(page([task('task-1', 'Hồ sơ dự án')], false));
  mocks.documentsPage.mockResolvedValue(page([document('doc-legacy', 'Tệp cũ')], false));
  mocks.taskDocumentsPage.mockResolvedValue(page([taskDocument('doc-1', ['PREVIEW', 'DOWNLOAD'])], false));
  render(<DocumentList />);
  expect(await screen.findByRole('heading', { name: 'Hồ sơ dự án' })).toBeInTheDocument();
  expect(screen.getByText('PREVIEW')).toBeInTheDocument();
  expect(screen.getByText('Chưa gắn task')).toBeInTheDocument();
});

it('requires a task and sends it in the upload form', async () => {
  render(<DocumentList />);
  await screen.findByRole('option', { name: 'Hồ sơ dự án' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Task upload' }), { target: { value: 'task-1' } });
  fireEvent.change(screen.getByLabelText(/Choose a file/i), { target: { files: [file] } });
  fireEvent.submit(screen.getByRole('button', { name: /Tải tài liệu lên/i }).closest('form')!);
  await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
  expect(mocks.upload.mock.calls[0][0].get('task_id')).toBe('task-1');
});
```

- [ ] **Step 2: Run the document tests and verify they fail**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/document-task-grouping.test.tsx tests/task-documents-loading.test.tsx
```

Expected: FAIL because the current page renders one ungrouped table and has no task selector.

- [ ] **Step 3: Load task and document pages and build grouped view models**

Use `tasksApi.listPage({ page: '1', page_size: '100' })` and `documentsApi.listPage(1, 100)`. For each visible task request `documentsApi.taskDocumentsPage(task.id, 1, 100)`. Build a `Map<taskId, TaskDocument[]>`, keep a `Set` of associated document IDs, and put remaining documents in `Chưa gắn task`. A failed task group renders an inline retry state and does not clear other groups.

- [ ] **Step 4: Replace the global upload form with task-aware fields**

Add a required `SearchableSelect` named `task_id` labelled `Task upload`, populated with visible task titles. Disable submit until a task is selected and a file is present. Before calling `documentsApi.upload`, set `task_id`, derive title/type/security level from the current form and file, and set `grants` to the current user plus task creator/assignee/reviewer with `PREVIEW` and `DOWNLOAD`, deduplicated by ID and expiring in 30 days. Keep the existing 25 MB guard and progress/error text.

- [ ] **Step 5: Render task groups and permission chips**

Replace the generic document table with task sections. Each card shows document title, version, security level, task title, and every permission returned by the task-document API. Use links to `/documents/:id?task_id=:taskId`; keep legacy documents visible with a `Chưa gắn task` label and no fabricated task permissions.

- [ ] **Step 6: Run document tests and commit**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/document-task-grouping.test.tsx tests/task-documents-loading.test.tsx tests/task-document-permissions.test.tsx
```

Expected: PASS.

```bash
git add frontend/web/src/types/document.ts frontend/web/src/features/documents/document-list.tsx frontend/web/src/features/documents/documents.module.css frontend/web/tests/task-create-documents.test.tsx frontend/web/tests/document-task-grouping.test.tsx
git commit -m "feat: organize documents by task permissions"
```

## Task 6: Apply the Lark-like visual hierarchy and responsive behavior

**Files:**
- Modify: `frontend/web/src/features/tasks/task-detail.module.css`
- Modify: `frontend/web/src/features/tasks/task-people.module.css`
- Modify: `frontend/web/src/features/tasks/task-children.module.css`
- Modify: `frontend/web/src/features/tasks/task-collaboration.module.css`
- Modify: `frontend/web/src/features/documents/documents.module.css`
- Modify: `frontend/web/src/features/notifications/notifications.module.css`

- [ ] **Step 1: Add layout assertions to component tests**

Assert the task detail contains the Lark-style semantic landmarks: task header, people section, sub-task section, collaboration tablist, and documents section. Assert mobile-safe controls have accessible names; avoid relying on CSS class names for behavior.

- [ ] **Step 2: Implement the shared visual rules**

Use the existing light workspace tokens and blue primary action color. Apply compact status tags, avatar circles, 1px neutral borders, 8–12px card radii, 16–24px section spacing, and a two-column collaboration layout that collapses to one column below 700px. Keep the existing drawer max width and top action bar.

- [ ] **Step 3: Add responsive and focus-visible styles**

At widths below 700px stack metadata and people rows, make tabs horizontally scrollable, make upload fields one column, and keep retry/load-more buttons full width. Add `:focus-visible` outlines to links, tabs, buttons, and notification detail links.

- [ ] **Step 4: Run frontend lint and commit**

Run:

```bash
pnpm backend:lint
pnpm --filter frontend/web build
```

Expected: lint and build pass.

```bash
git add frontend/web/src/features/tasks/task-detail.module.css frontend/web/src/features/tasks/task-people.module.css frontend/web/src/features/tasks/task-children.module.css frontend/web/src/features/tasks/task-collaboration.module.css frontend/web/src/features/documents/documents.module.css frontend/web/src/features/notifications/notifications.module.css
git commit -m "style: align collaboration views with workspace layout"
```

## Task 7: Full verification and handoff

**Files:**
- Modify only files needed to correct verified failures from the focused suites.

- [ ] **Step 1: Run all focused frontend tests**

```bash
pnpm --dir frontend/web exec vitest run tests/pagination-api.test.ts tests/task-detail-hierarchy.test.tsx tests/task-subtask.test.tsx tests/task-workflow.test.tsx tests/task-collaboration.test.tsx tests/task-comments.test.tsx tests/notifications.test.tsx tests/document-task-grouping.test.tsx tests/task-documents-loading.test.tsx tests/task-document-permissions.test.tsx
```

Expected: all listed suites pass.

- [ ] **Step 2: Run frontend build and repository formatting checks**

```bash
pnpm --filter frontend/web build
git diff --check
```

Expected: build succeeds and `git diff --check` prints no whitespace errors.

- [ ] **Step 3: Run relevant backend contract/integration tests**

```bash
NODE_ENV=test pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/task-management-service/test/pagination.integration.spec.ts apps/document-management-service/test/document-upload.integration.spec.ts apps/document-management-service/test/task-documents.controller.spec.ts apps/notification-service/test/pagination.integration.spec.ts
```

Expected: existing backend pagination, upload association, task-document, and notification contracts remain green; no backend schema change is required.

- [ ] **Step 4: Inspect the final diff and status**

```bash
git diff HEAD~6 --stat
git status --short
```

Confirm only the implementation commits and the pre-existing user files remain in the worktree; do not stage or remove unrelated `.gitignore` or existing untracked planning/spec files.
