# Task Assignment Side Panel Design

## Context

The task API already supports creating tasks, assigning an assignee, selecting a reviewer, setting a deadline, creating subtasks, and attaching documents after a task exists. The current web experience exposes these capabilities as separate actions, which makes it easy to create an incomplete task or miss the review owner.

This design adds a Lark-like side panel for creating and assigning a task while preserving the current task-list/detail context.

## Goals

- Make task creation understandable for a first-time user.
- Allow an unassigned task without pretending it is ready to work on.
- Make the reviewer explicit while defaulting it to the task creator.
- Prevent self-review by disallowing the assignee and reviewer from being the same person.
- Keep permission decisions enforced by the backend, not only by UI state.
- Support creating a task from the task list or as a child task from a task detail view.
- Keep document attachment available without creating orphan documents when task creation fails.

## Non-goals

- Task templates, recurring tasks, priorities, labels, watchers, or custom workflow states.
- Bulk assignment of multiple tasks.
- A draft database model. An unassigned task is a real task in `CREATED` state.
- Creating nested subtasks inside the initial top-level task drawer. Subtasks are created from the parent task detail after the parent exists.
- Changing the existing task lifecycle beyond the assignment rules described here.

## User experience

### Entry points

- The task list opens the side panel from `Tạo task`.
- The task detail view opens the same panel from `Tạo subtask`.
- The task-list creation flow creates one top-level task. It does not create nested subtasks before the parent exists.
- When opened from a parent task, `parent_task_id` is prefilled and shown as read-only context.
- The panel closes after successful creation, or remains open with the failed field and an actionable error.

The panel is a right-side drawer so the user keeps the list/detail context. It has a clear title, a short explanation, a single primary action, and a secondary cancel action. Closing with unsaved values requires confirmation.

### Fields and defaults

| Field | Required | Default | Behavior |
| --- | --- | --- | --- |
| Task title | Yes | Empty | Trimmed; blank values are rejected inline and by the API. |
| Description / completion criteria | No | Empty | Explains the expected output; sent as `description`. |
| Assignee | No | Empty | Searchable employee picker; empty means `Chưa giao`. |
| Reviewer | Yes after defaulting | Current user | Searchable employee picker; creator can replace the default. |
| Deadline | No | Empty | Optional date; displayed with the user's locale. |
| Parent task | Only for subtask flow | Current task | Read-only in the subtask flow. |

The employee picker uses the existing directory API and displays a stable human label (name/email) while submitting the user ID.

The panel must reject a reviewer that is the same user as the assignee. The error is shown next to both fields and the primary action remains disabled until the conflict is fixed.

### Primary action and lifecycle wording

- No assignee: button label `Tạo task`; helper text `Task sẽ ở trạng thái Chưa giao và có thể giao sau.`
- Assignee selected: button label `Giao task`.
- A newly created task with no assignee is `CREATED`.
- A newly created task with an assignee is `ASSIGNED`.
- A task without an assignee cannot be started or submitted.

The reviewer defaults to the creator in both cases. If the creator chooses another reviewer, that reviewer becomes the only person allowed to review/approve submissions. The creator can change the reviewer later.

### Parent-task rule

The current backend only allows the current assignee of a parent task to create a child task. The frontend must reflect that rule:

- Show `Tạo subtask` only when the current user is the parent assignee, or show it disabled with an explanation when the user can view but cannot create a child.
- Do not silently retry a failed child-task creation as a top-level task.
- If the parent task is only available as an ancestor summary, do not offer the subtask action.

### Documents

Documents are attached after the task is successfully created because the document API requires a task ID. The success state offers `Thêm tài liệu` and can navigate to the task document area. If document upload fails, the task remains valid and the UI offers retry; it does not roll back the task.

## Backend contract changes

The existing endpoints are sufficient for the basic flow, but creation must accept the reviewer atomically to avoid a partial flow where task creation succeeds and reviewer assignment fails.

### Create task

Extend `POST /api/tasks` with an optional `reviewer_id`:

```json
{
  "title": "Chuẩn bị báo cáo tháng",
  "description": "Gửi báo cáo và số liệu nguồn",
  "assignee_id": "employee-id-or-null",
  "reviewer_id": "reviewer-id",
  "deadline": "2026-08-30T17:00:00.000Z",
  "parent_task_id": "parent-id-or-null"
}
```

Rules:

- Omitted or null `reviewer_id` resolves to the authenticated creator.
- `reviewer_id` must identify an employee.
- `reviewer_id` must not equal `assignee_id` when an assignee exists.
- The reviewer is persisted and added as a task participant in the same transaction.
- Existing clients that omit `reviewer_id` keep the current creator-default behavior.

### Existing assignment endpoints

The same assignee/reviewer conflict rule must be enforced in:

- `POST /api/tasks/:id/assign`
- `PUT /api/tasks/:id/reviewer`

The frontend may validate first for immediate feedback, but the backend remains authoritative.

The current reviewer remains the only reviewer after a change. An old reviewer may remain a direct participant if they were already a participant; changing reviewer revokes review authority, not necessarily general task visibility. The UI should show the current reviewer clearly rather than implying that all participants can approve.

### No new directory endpoint

The web app can use the existing `/users/directory` API for assignee and reviewer search. A dedicated task-assignment directory endpoint is not required for this scope.

## Frontend data flow

1. Open the drawer and initialize local form state with the current user as reviewer.
2. Load or reuse the employee directory for searchable assignee/reviewer controls.
3. Validate locally: title, reviewer/assignee conflict, parent context, and date format.
4. Submit one create request including `assignee_id` and `reviewer_id` when applicable.
5. Replace the list/detail cache with the returned task and close the drawer.
6. Offer document attachment from the returned task ID; offer subtask creation from the resulting direct task detail only when the parent-assignee rule allows it.
7. On `400`, map field errors to the form. On `403`, explain the permission failure and keep the entered values. On network/`5xx`, keep the form open and show an unknown-outcome warning; do not automatically resend the create request because the server may already have created the task.

The submit action must be guarded against double-clicks and repeated keyboard submission. A successful response is the only condition that closes the drawer.

## Accessibility and usability

- Drawer has a labeled dialog region, focus moves to the title, and focus returns to the trigger on close.
- All controls have visible labels; placeholders do not replace labels.
- Searchable selects support keyboard navigation, Escape, and screen-reader listbox semantics.
- Required and conflict errors are announced and associated with their fields.
- The primary action has a visible loading state and is disabled only for a real validation/submission reason.
- The panel works at narrow desktop widths without hiding the primary action.

## Verification

### Backend tests

- Create with no assignee defaults reviewer to creator and returns `CREATED`.
- Create with assignee and a different reviewer returns `ASSIGNED` and creates the reviewer participant atomically.
- Create rejects reviewer equal to assignee.
- Reassignment rejects an assignee equal to the current reviewer.
- Reviewer change rejects a reviewer equal to the current assignee.
- Existing creator-default clients remain valid.
- Parent-task permission behavior remains unchanged.

### Frontend tests

- Drawer opens from task list and the permitted detail/subtask entry point.
- Empty assignee produces the `Tạo task` wording and submits successfully.
- Selecting an assignee changes wording to `Giao task`.
- Reviewer defaults to the creator and can be changed.
- Assignee/reviewer conflict blocks submission and displays an actionable error.
- API failures preserve form values and do not close the drawer.
- Network/`5xx` outcomes do not trigger an automatic duplicate create request.
- Double submit sends only one request.
- Keyboard and accessible-name behavior works for the drawer and searchable selects.

### End-to-end flow

1. Creator opens the drawer and creates an unassigned task.
2. Creator later assigns an employee and a different reviewer.
3. Assignee starts the task and submits a result.
4. Reviewer sees the submission and approves it.
5. Assignee/reviewer self-review attempts are rejected.
6. A user without direct task participation cannot access the full task.
7. The subtask action is unavailable to a user who is not the parent assignee, and a direct API attempt is rejected.

## Rollout shape

Implement the backend contract validation first, then the shared side-panel component and task-list/detail entry points. Keep the existing separate assign/reviewer actions as fallback until the panel is verified. Remove duplicate entry points only after the end-to-end flow is stable.
