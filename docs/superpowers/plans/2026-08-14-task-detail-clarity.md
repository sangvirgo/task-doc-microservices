# Task Detail Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make task detail progress, participant information, and task actions obvious to non-technical users while preserving existing API and authorization behavior.

**Architecture:** Keep task data loading and permission decisions in `TaskDetail`. Extract no new backend surface: the existing `participants`, `block`, `unblock`, and `status` API methods remain the only mutation paths. Update the existing `TaskPeople` and `TaskProgress` presentation components, and replace the bottom secondary-details disclosure with an accessible top-right action menu and inline block-reason dialog.

**Tech Stack:** Next.js 16, React, TypeScript, CSS Modules, Vitest, React Testing Library.

---

### Task 1: Lock the requested copy and action behavior with failing tests

**Files:**
- Modify: `frontend/web/tests/task-progress.test.tsx`
- Modify: `frontend/web/tests/task-detail-hierarchy.test.tsx`

- [ ] **Step 1: Update the progress test to reject the technical lifecycle wording.**

In the leaf progress test, keep the existing assertion for `Tiến độ công việc` and add:

```tsx
expect(screen.queryByText('Vòng đời công việc')).not.toBeInTheDocument();
```

- [ ] **Step 2: Add an integration test for the top action menu.**

Extend the task API mock with `block`, `unblock`, and `status` functions. Render an `IN_PROGRESS` task while the session user is the current assignee, then assert that the top button named `Thao tác` exists, the bottom `Thông tin & thao tác khác` disclosure does not exist, and clicking the menu exposes `Báo cáo vấn đề / Chặn công việc`.

- [ ] **Step 3: Add a test for the creator-only cancel action and assignee block action.**

Render the same task as creator and assert the menu contains `Hủy công việc`; render it as an unrelated participant and assert that neither `Báo cáo vấn đề / Chặn công việc` nor `Hủy công việc` is visible.

- [ ] **Step 4: Update participant expectations to use plain Vietnamese role labels.**

Change the existing participant assertion from `Người review` to `Người duyệt`, and require the visible button name `Thêm người tham gia` for the creator. Add an assertion that the rendered participant row includes the role text and email without relying on the avatar tooltip.

- [ ] **Step 5: Run the focused tests and confirm RED.**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/task-progress.test.tsx tests/task-detail-hierarchy.test.tsx
```

Expected: failures identify the existing `Vòng đời công việc` text, missing `Thao tác` menu, remaining bottom disclosure, and old `Người review` label. Do not modify production code before this failure is observed.

### Task 2: Replace the bottom task actions with a clear top menu

**Files:**
- Modify: `frontend/web/src/features/tasks/task-detail.tsx`
- Modify: `frontend/web/src/features/tasks/task-detail.module.css`

- [ ] **Step 1: Add state and event handling for the top menu and block form.**

Add local state for `actionMenuOpen`, `blockFormOpen`, and `blockReason`, plus a ref/effect that closes the menu on outside pointer interaction and Escape. Keep the existing `canModifyTask`, `canCancelTask`, `pendingAction`, `notice`, and `act` behavior as the permission and mutation source. Define `cancelTask` next to the other handlers so it confirms with `window.confirm('Hủy công việc này?')` and then calls `act(() => tasksApi.status(task.id, 'CANCELLED'), 'Đã hủy công việc.', 'Không thể hủy công việc.')`.

- [ ] **Step 2: Render the accessible top-right action button.**

Inside the task header title row, render a button with visible `⋯` icon plus `Thao tác`, `aria-haspopup="menu"`, `aria-expanded`, and `aria-controls`. The menu is positioned relative to the header and contains only state/permission-appropriate buttons:

```tsx
{canModifyTask && !task.blocked && !finalState && (
  <button type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); setBlockFormOpen(true); }}>
    Báo cáo vấn đề / Chặn công việc
  </button>
)}
{canModifyTask && task.blocked && (
  <button type="button" role="menuitem" onClick={() => void act(() => tasksApi.unblock(task.id), 'Đã bỏ chặn công việc.', 'Không thể bỏ chặn công việc.')}>
    Bỏ chặn công việc
  </button>
)}
{canCancelTask && !task.blocked && (
  <button type="button" role="menuitem" onClick={cancelTask}>Hủy công việc</button>
)}
```

The button text and menu labels must remain plain Vietnamese; do not expose API names or status enum values.

- [ ] **Step 3: Add the inline block-reason dialog.**

Render a `role="dialog"` form when `blockFormOpen`, with heading `Báo cáo vấn đề / Chặn công việc`, helper text explaining that the reason will be shown to people working on the task, a required textarea labeled `Lý do`, and `Hủy` / `Xác nhận chặn công việc` buttons. Empty or whitespace-only reasons must show `Hãy nhập lý do trước khi chặn công việc.` without calling `tasksApi.block`. A valid submission calls `tasksApi.block(task.id, reason)` through `act`, closes the form only after success, clears the reason, and reloads the task.

- [ ] **Step 4: Remove the old bottom disclosure and style the new controls.**

Delete the `secondaryDetails` section and its styles. Add CSS for the header action wrapper, visible menu, menu-item icons/labels, dialog, 44px minimum action targets, focus-visible outlines, and a mobile layout that keeps the menu inside the viewport.

- [ ] **Step 5: Run the focused tests and confirm GREEN.**

Run the TaskProgress and TaskDetail hierarchy tests again. Expected: all tests in both files pass, including the new menu permission and block validation assertions.

### Task 3: Make participants readable and the add flow explicit

**Files:**
- Modify: `frontend/web/src/features/tasks/task-people.tsx`
- Modify: `frontend/web/src/features/tasks/task-people.module.css`
- Modify: `frontend/web/tests/task-detail-hierarchy.test.tsx`

- [ ] **Step 1: Add role-label mapping and readable participant rows.**

Define a typed role map in `task-people.tsx`:

```tsx
const roleLabels: Record<string, string> = {
  CREATOR: 'Người tạo',
  ASSIGNEE: 'Người thực hiện',
  REVIEWER: 'Người duyệt',
  PARTICIPANT: 'Người tham gia',
};
```

Use `roleLabels[row.role] ?? 'Người tham gia'` for participant-only rows. Render each person with an explicit avatar, identity text, and role badge/text; keep the existing duplicate collapse behavior.

- [ ] **Step 2: Replace the compact add control with a visible inline panel.**

Use a button named `+ Thêm người tham gia`. When opened, show a labeled searchable employee selector, a labeled optional role input with placeholder `Ví dụ: Người hỗ trợ`, and `Thêm người` / `Hủy` buttons. Keep the creator-only guard and existing `onAddParticipant` callback. Do not change the API payload shape.

- [ ] **Step 3: Style for non-technical scanning.**

Increase section heading, identity, and role text sizes; use card-like rows with clear borders/backgrounds; make the add button blue and prominent; add visible focus states; keep a one-column mobile layout.

- [ ] **Step 4: Run the focused participant tests.**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/task-detail-hierarchy.test.tsx
```

Expected: participant email/identity, `Người tạo`, `Người thực hiện`, `Người duyệt`, `Người tham gia`, and creator-only `Thêm người tham gia` assertions pass.

### Task 4: Rename the progress eyebrow and verify the full feature

**Files:**
- Modify: `frontend/web/src/features/tasks/task-progress.tsx`
- Modify: `frontend/web/tests/task-progress.test.tsx`

- [ ] **Step 1: Change only the leaf progress eyebrow copy.**

Replace `<p className={styles.eyebrow}>Vòng đời công việc</p>` with `<p className={styles.eyebrow}>Tiến độ công việc</p>`. Keep all workflow step labels and calculation logic unchanged.

- [ ] **Step 2: Run focused regression tests.**

Run:

```bash
pnpm --dir frontend/web exec vitest run tests/task-progress.test.tsx tests/task-detail-hierarchy.test.tsx tests/task-workflow.test.tsx tests/task-subtask.test.tsx
```

Expected: all focused files pass.

- [ ] **Step 3: Run repository verification.**

Run:

```bash
pnpm --dir frontend/web test
pnpm --dir frontend/web lint
pnpm --dir frontend/web typecheck
pnpm --dir frontend/web build
git diff --check
```

Expected: 0 exit status for every command and no remaining `Vòng đời công việc` or `Thông tin & thao tác khác` in the task detail implementation.
