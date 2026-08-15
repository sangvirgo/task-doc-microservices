# Task Progress UI Design

## Goal

Expose the task progress data that the backend already returns in a way that is useful and honest for both parent tasks and ordinary workflow tasks. The frontend must not invent a percentage for a task that has no child tasks.

## Scope

This change is frontend-only. It will not add API calls, change backend response shapes, modify task lifecycle rules, or change the workspace statistics aggregation.

The affected surfaces are:

- Task detail: a full progress section.
- Task list and Kanban cards: a compact progress indicator when the task has child tasks.
- Shared task types and tests.

The existing workspace overview status distribution remains unchanged because it already explains the overall workload by lifecycle status and the statistics endpoint does not return per-task progress.

## Backend contract and semantics

The task API already returns these fields on `Task`:

- `completion_percentage`: percentage of child tasks whose status is `APPROVED`.
- `child_task_count`: total number of direct child tasks.
- `approved_child_task_count`: number of approved direct child tasks.
- `completion_color`: `GREEN`, `YELLOW`, or `RED`.

For a task without child tasks, the backend returns `100` only when the task itself is `APPROVED`; otherwise it returns `0`. The UI will not present that `0` as a misleading work estimate. Instead, leaf tasks use their lifecycle status as a workflow stepper. For parent tasks, the UI presents the percentage explicitly as sub-task completion.

## Design

### Shared progress component

Create a presentational `TaskProgress` component under `frontend/web/src/features/tasks/` with a colocated CSS module. It receives the task progress fields and status as typed props and performs no API access or state management.

The component has two modes:

1. Parent task mode (`child_task_count > 0`)
   - Heading: `Tiến độ sub-task`.
   - Primary value: `completion_percentage` formatted without unnecessary trailing decimals.
   - Supporting value: `approved_child_task_count / child_task_count sub-task đã phê duyệt`.
   - A determinate progress bar colored from the backend completion color.

2. Leaf task mode (`child_task_count === 0`)
   - Heading: `Tiến độ công việc`.
   - A lifecycle stepper for `ASSIGNED`, `IN_PROGRESS`, `WAITING_REVIEW`, and `APPROVED`.
   - `CREATED` is shown as the pre-assignment state; `NEED_REVISION` maps back to the in-progress stage with a revision warning.
   - `REJECTED` and `CANCELLED` show a red terminal state instead of a false numeric percentage.

The component will clamp percentage and child counts to safe display ranges so malformed optional values cannot create an overfilled bar or negative text. The backend-provided color is mapped to existing visual tones and falls back to the neutral/in-progress tone when absent.

### Task detail

Render the full component immediately below the task header and before the metadata/sub-task content. This makes progress visible without requiring the user to scroll into the sub-task list. Parent tasks show both the aggregate bar and the existing sub-task list, so the number can be verified by opening the children.

### Task list and Kanban

Extend the existing task metadata renderer with a compact `X/Y sub-task` indicator and a thin bar for tasks with children. Keep ordinary leaf tasks uncluttered because their status badge and deadline already communicate the actionable workflow state. The compact indicator links visually to the detail view but does not add navigation or requests.

### Accessibility and responsive behavior

- Use `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and a meaningful label in parent mode.
- Do not communicate progress through color alone; percentage and approved/total text remain visible.
- Mark the lifecycle stepper as a labelled list and expose the current step with text/`aria-current`.
- Keep the detail component readable on mobile by stacking its value and bar, and allow compact list metadata to wrap.
- Respect reduced-motion preferences by avoiding required animation; any transition is purely cosmetic.

## Data flow and error handling

The existing `tasksApi.list` and `tasksApi.get` responses remain the only data source. No client-side progress polling, derived API request, or optimistic progress update is introduced. If the optional progress fields are missing, the component falls back to the task status and renders a neutral workflow state rather than failing the whole task page.

## Testing

Add test-first coverage for:

- Parent task progress such as `2/3` and a clamped accessible progress value.
- Leaf task rendering without a misleading `0%` label.
- Approved, revision, rejected, and cancelled states.
- Full progress rendering in task detail.
- Compact progress rendering in task list/Kanban while preserving the existing task status and navigation.

Run the focused frontend Vitest suite first, then the complete frontend test suite and TypeScript/build verification before completion.

## Non-goals

- Changing the backend calculation of task progress.
- Adding an average-progress statistic to the workspace overview.
- Introducing a new task status or changing lifecycle transitions.
- Removing or deleting any task, document, or grant data.
