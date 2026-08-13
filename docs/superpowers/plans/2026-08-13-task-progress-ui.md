# Task Progress UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Display backend-provided task progress clearly on task detail, list, and Kanban views without inventing a misleading percentage for leaf tasks.

**Architecture:** Add a small pure progress-model helper and a presentational `TaskProgress` component. Parent tasks use the backend's approved-child count and percentage; leaf tasks use a lifecycle stepper. The existing task API remains the only data source.

**Tech Stack:** Next.js 16, React 19, TypeScript strict mode, CSS Modules, Vitest, React Testing Library.

---

### Task 1: Add the typed progress model and shared component

**Files:**
- Create: `frontend/web/src/features/tasks/task-progress-model.ts`
- Create: `frontend/web/src/features/tasks/task-progress.tsx`
- Create: `frontend/web/src/features/tasks/task-progress.module.css`
- Modify: `frontend/web/src/types/task.ts:1-4`
- Test: `frontend/web/tests/task-progress.test.tsx`

- [ ] **Step 1: Write the failing component tests**

Create `frontend/web/tests/task-progress.test.tsx` with tests for the public component behavior:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TaskProgress } from '@/features/tasks/task-progress';

describe('TaskProgress', () => {
  it('shows approved child progress with an accessible percentage', () => {
    render(
      <TaskProgress
        status="IN_PROGRESS"
        completion_percentage={66.67}
        child_task_count={3}
        approved_child_task_count={2}
        completion_color="YELLOW"
      />,
    );

    expect(screen.getByText('66.67%')).toBeInTheDocument();
    expect(screen.getByText('2/3 sub-task đã phê duyệt')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '66.67');
  });

  it('uses lifecycle steps instead of claiming zero percent for a leaf task', () => {
    render(<TaskProgress status="IN_PROGRESS" child_task_count={0} completion_percentage={0} />);

    expect(screen.getByText('Tiến độ công việc')).toBeInTheDocument();
    expect(screen.getByText('Đang làm')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows revision as an actionable warning on the in-progress step', () => {
    render(<TaskProgress status="NEED_REVISION" child_task_count={0} />);

    expect(screen.getByText('Cần chỉnh sửa')).toBeInTheDocument();
    expect(screen.getByText('Tiếp tục từ bước Đang làm')).toBeInTheDocument();
  });

  it('shows a red terminal state for rejected and cancelled tasks', () => {
    const { rerender } = render(<TaskProgress status="REJECTED" child_task_count={0} />);
    expect(screen.getByText('Từ chối')).toBeInTheDocument();

    rerender(<TaskProgress status="CANCELLED" child_task_count={0} />);
    expect(screen.getByText('Đã hủy')).toBeInTheDocument();
  });

  it('renders a compact child indicator only when children exist', () => {
    const { rerender } = render(
      <TaskProgress
        compact
        status="ASSIGNED"
        completion_percentage={50}
        child_task_count={2}
        approved_child_task_count={1}
      />,
    );
    expect(screen.getByText('1/2')).toBeInTheDocument();

    rerender(<TaskProgress compact status="ASSIGNED" child_task_count={0} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --dir frontend/web test --run tests/task-progress.test.tsx`

Expected: FAIL because `@/features/tasks/task-progress` does not exist yet. Do not implement production code until this failure is observed.

- [ ] **Step 3: Add the frontend completion color type**

In `frontend/web/src/types/task.ts`, add:

```ts
export type CompletionColor = 'GREEN' | 'YELLOW' | 'RED';
```

Change `Task.completion_color?: string` to `Task.completion_color?: CompletionColor` so the UI cannot silently accept arbitrary color names from the typed API.

- [ ] **Step 4: Implement the pure progress model**

Create `frontend/web/src/features/tasks/task-progress-model.ts` with typed input/output and these rules:

```ts
import type { CompletionColor, TaskStatus } from '@/types/task';

export interface TaskProgressInput {
  status: TaskStatus;
  completion_percentage?: number;
  child_task_count?: number;
  approved_child_task_count?: number;
  completion_color?: CompletionColor;
}

export const workflowSteps = [
  { status: 'CREATED', label: 'Mới tạo' },
  { status: 'ASSIGNED', label: 'Đã giao' },
  { status: 'IN_PROGRESS', label: 'Đang làm' },
  { status: 'WAITING_REVIEW', label: 'Chờ phê duyệt' },
  { status: 'APPROVED', label: 'Đã phê duyệt' },
] as const;

export function clampPercentage(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Number(value)));
}

export function clampCount(value: number | undefined, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maximum, Math.max(0, Math.floor(Number(value))));
}

export function workflowStepIndex(status: TaskStatus): number {
  if (status === 'NEED_REVISION') return 2;
  const index = workflowSteps.findIndex(step => step.status === status);
  return index >= 0 ? index : 0;
}

export function buildTaskProgressModel(input: TaskProgressInput) {
  const childCount = clampCount(input.child_task_count);
  const approvedCount = clampCount(input.approved_child_task_count, childCount);
  return {
    hasChildren: childCount > 0,
    childCount,
    approvedCount,
    percentage: clampPercentage(input.completion_percentage),
    color: input.completion_color ?? 'YELLOW',
    stepIndex: workflowStepIndex(input.status),
    failed: input.status === 'REJECTED' || input.status === 'CANCELLED',
  };
}
```

- [ ] **Step 5: Implement the presentational component and CSS**

Create `task-progress.tsx` with a typed `TaskProgressProps` extending `TaskProgressInput` and optional `compact`. Parent mode renders the accessible progress bar and `approvedCount/childCount`; leaf mode renders the five workflow steps, marks the current step with `aria-current="step"`, adds the NEED_REVISION warning, and renders terminal REJECTED/CANCELLED text. In compact mode, return `null` for leaf tasks.

Use `completion_color` only as a visual modifier (`green`, `yellow`, `red`) while keeping the numeric/supporting text visible. Use CSS Modules in `task-progress.module.css`; include responsive stacking for the full detail version and wrapped metadata for compact mode.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `pnpm --dir frontend/web test --run tests/task-progress.test.tsx`

Expected: all five tests pass.

- [ ] **Step 7: Commit the shared component**

```bash
git add frontend/web/src/types/task.ts frontend/web/src/features/tasks/task-progress-model.ts frontend/web/src/features/tasks/task-progress.tsx frontend/web/src/features/tasks/task-progress.module.css frontend/web/tests/task-progress.test.tsx
git commit -m "feat: add typed task progress component"
```

### Task 2: Render full progress on task detail

**Files:**
- Modify: `frontend/web/src/features/tasks/task-detail.tsx:11-20,149-158`
- Test: `frontend/web/tests/task-progress-detail.test.tsx`

- [ ] **Step 1: Write the failing detail integration test**

Create a focused test using the existing `TaskDetail` mocks. Return a parent task with `completion_percentage: 66.67`, `child_task_count: 3`, `approved_child_task_count: 2`, and `completion_color: 'YELLOW'`; render the detail and assert `Tiến độ sub-task`, `2/3 sub-task đã phê duyệt`, and the accessible progressbar.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --dir frontend/web test --run tests/task-progress-detail.test.tsx`

Expected: FAIL because `TaskDetail` does not render `TaskProgress` yet.

- [ ] **Step 3: Wire the component into detail**

Import `TaskProgress` in `task-detail.tsx` and render it immediately after the task header and before the metadata grid:

```tsx
<TaskProgress
  status={task.status}
  completion_percentage={task.completion_percentage}
  child_task_count={task.child_task_count}
  approved_child_task_count={task.approved_child_task_count}
  completion_color={task.completion_color}
/>
```

- [ ] **Step 4: Run detail and existing task tests**

Run: `pnpm --dir frontend/web test --run tests/task-progress-detail.test.tsx tests/task-workflow.test.tsx tests/task-subtask.test.tsx`

Expected: all focused detail tests pass with no existing workflow/sub-task regressions.

- [ ] **Step 5: Commit the detail integration**

```bash
git add frontend/web/src/features/tasks/task-detail.tsx frontend/web/tests/task-progress-detail.test.tsx
git commit -m "feat: show task progress on detail"
```

### Task 3: Add compact progress to list and Kanban

**Files:**
- Modify: `frontend/web/src/features/tasks/task-list.tsx:79-93,108-115`
- Modify: `frontend/web/src/features/tasks/tasks.module.css:28-29`
- Test: `frontend/web/tests/task-progress-list.test.tsx`

- [ ] **Step 1: Write the failing list/Kanban test**

Render `TaskList` with one task containing `child_task_count: 4`, `approved_child_task_count: 3`, and `completion_percentage: 75`. Assert the list view shows `3/4` and the task link remains `/tasks/<id>`. Click the existing Kanban tab and assert the same compact indicator remains visible in the card.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --dir frontend/web test --run tests/task-progress-list.test.tsx`

Expected: FAIL because the list and card renderers do not include a progress component.

- [ ] **Step 3: Add compact progress to both render paths**

Import `TaskProgress` in `task-list.tsx`. In `renderTaskMeta`, append:

```tsx
{task.child_task_count ? (
  <TaskProgress
    compact
    status={task.status}
    completion_percentage={task.completion_percentage}
    child_task_count={task.child_task_count}
    approved_child_task_count={task.approved_child_task_count}
    completion_color={task.completion_color}
  />
) : null}
```

Because both the list row and Kanban card call `renderTaskMeta`, this keeps their behavior identical. Add compact-specific selectors to `tasks.module.css` so the indicator fits the existing metadata row and the bar has a visible minimum width.

- [ ] **Step 4: Run list tests and verify GREEN**

Run: `pnpm --dir frontend/web test --run tests/task-progress-list.test.tsx tests/task-create-documents.test.tsx`

Expected: all focused list tests pass.

- [ ] **Step 5: Commit the list integration**

```bash
git add frontend/web/src/features/tasks/task-list.tsx frontend/web/src/features/tasks/tasks.module.css frontend/web/tests/task-progress-list.test.tsx
git commit -m "feat: show compact task progress in lists"
```

### Task 4: Full verification and cleanup

**Files:**
- Modify only if required by verification: files from Tasks 1-3.

- [ ] **Step 1: Run the complete frontend test suite**

Run: `pnpm --dir frontend/web test --run`

Expected: exit code 0 with all frontend tests passing.

- [ ] **Step 2: Run lint and typecheck**

Run: `pnpm --dir frontend/web lint && pnpm --dir frontend/web typecheck`

Expected: exit code 0 with no ESLint or TypeScript errors.

- [ ] **Step 3: Run the production build**

Run: `pnpm --dir frontend/web build`

Expected: exit code 0 and a successful Next.js production build.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check HEAD~3..HEAD` and `git status --short`.

Expected: no whitespace errors; only the progress UI commits plus the pre-existing `frontend/web/next-env.d.ts` worktree modification remain.

- [ ] **Step 5: Commit any verification-only correction**

If verification requires a correction, rerun the affected focused test and then commit only the corrected progress UI files with:

```bash
git add frontend/web/src/features/tasks/task-progress-model.ts frontend/web/src/features/tasks/task-progress.tsx frontend/web/src/features/tasks/task-progress.module.css frontend/web/src/features/tasks/task-detail.tsx frontend/web/src/features/tasks/task-list.tsx frontend/web/src/features/tasks/tasks.module.css frontend/web/src/types/task.ts frontend/web/tests/task-progress.test.tsx frontend/web/tests/task-progress-detail.test.tsx frontend/web/tests/task-progress-list.test.tsx
git commit -m "fix: polish task progress UI verification"
```
