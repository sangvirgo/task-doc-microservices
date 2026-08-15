# Task detail drawer redesign

## Goal

Rebuild the task detail screen into a focused dark drawer-like workspace inspired by the
provided reference image. The screen should be easy to scan and operate without adding
new backend endpoints, invented fields, or duplicate task flows.

## Confirmed direction

Use the selected **A — focused task drawer** direction:

- A compact top bar with navigation, task lifecycle actions, and overflow actions only when
  the corresponding existing permission/status allows them.
- A vertical reading flow instead of the current wide collection of cards and a dense side
  rail.
- The current task title and status are the visual anchor.
- Metadata such as assignee, deadline, task list, and description is shown as compact rows
  similar to the reference image.
- Attachments are shown as compact file cards using the existing task-document API and
  existing preview/download/detach permissions.
- Activity remains inside the task, while comments continue to use the official comments
  page linked from the task detail.

## Hierarchy and recursive navigation

`TaskChildren` will show direct child tasks inside the parent task detail. Each child is a
compact row with title, status, deadline/overdue indication, and a link to
`/tasks/{childId}`.

Clicking a child opens the same `TaskDetail` route for that child. The page therefore
recursively supports any depth without creating a second detail implementation. The child
view displays an explicit parent context above the title:

`Công việc / {parent title} / {current title}`

The parent title is loaded with the existing `tasksApi.get(parent_task_id)` call. The parent
context links back to the parent task when the API returns a navigable task; when it returns
ancestor-summary data, the title remains visible as context without exposing unavailable
content.

No `user_id` query parameter or new hierarchy endpoint is introduced. Access remains enforced
by the existing task APIs and the existing 403/ancestor-summary behavior.

## Existing API mapping

- Task and parent context: `tasksApi.get`
- Direct children: `tasksApi.children`
- Task lifecycle: `tasksApi.status`, `tasksApi.block`, and `tasksApi.unblock`; cancellation
  continues through `tasksApi.status` with the existing `CANCELLED` status
- Assignment and participants: `tasksApi.assign`, `tasksApi.addParticipant`,
  `tasksApi.participants`
- Submit and review: `tasksApi.submit`, `tasksApi.submissions`, `tasksApi.review`
- Activity: `tasksApi.activity`
- Comments: `tasksApi.comments` and the existing official comments route
- Documents: `documentsApi.taskDocuments`, `documentsApi.upload`, preview/download ticket,
  and detach operations already used by `TaskDocuments`

The implementation must preserve the current permission guards: only the assignee submits,
only the reviewer/creator reviews, and every direct participant can create a child task while
terminal tasks cannot create more children.

## Component boundaries

- `TaskDetail` owns task loading, parent-context loading, and direct-task/ancestor-summary
  branching.
- `TaskChildren` owns the direct child list and recursive navigation links. It must not
  duplicate the full task detail or expose child documents inline.
- `TaskDocuments` owns document loading and document actions; its presentation is restyled
  to fit the drawer flow without changing security checks.
- Existing workflow, activity, and comments components remain API-backed and are rearranged
  into the new order.

## States and error handling

- Loading, 403, ancestor-summary, and generic error states remain explicit.
- Parent-context failure must not prevent the current task from rendering; show a neutral
  parent label or the parent id only when no title is available.
- Empty children/documents/activity/comments states should be quiet, compact, and distinct
  from loading or permission errors.
- After mutations, keep the current task route and refresh the relevant data rather than
  redirecting to a new invented location.
- Responsive layout collapses to one readable column at narrow widths.

## Testing and acceptance criteria

- The task detail renders the compact drawer hierarchy and parent context for a child task.
- Clicking a child navigates to its own task route, and a child can navigate to another child
  through the same mechanism.
- Direct children render inside the parent task and do not leak sibling/parent documents or
  comments.
- Existing tests for participant-created child tasks, workflow permissions, document
  permissions, and official comments continue to pass.
- Add focused tests for parent-context loading, recursive child links, loading/error fallback,
  and the new compact sections.
- Run frontend tests, lint, typecheck, and production build before handoff.
