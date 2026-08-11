# Task Collaboration and Document Navigation Design

## Goal

Make task collaboration usable without leaving the task detail view, expose the task hierarchy and creator/participant context, make activity and comments paginated, make notifications actionable, and reorganize documents around task-scoped access.

## Scope

### Task detail

- Keep the existing task detail drawer route and its workflow actions.
- Restyle the drawer toward a Lark-like collaboration surface: light hierarchy, compact status tags, avatar groups, bordered cards, and responsive stacking.
- Add a task context block that always shows creator, assignee, reviewer, and direct participants with role labels. Existing assignment/add-participant permissions remain unchanged.
- Render the direct child tree from the `children` field already returned by `GET /tasks/:id`. The frontend task types currently omit this field, which is why the returned child data is not rendered. Each node links to its own task detail; a child detail loads its own children, preserving the complete navigable tree without broadening authorization.
- Keep task documents below the hierarchy/context sections. The task detail upload remains scoped to the current task and continues to use the existing document permission response.

### Collaboration tabs

- Replace the separate stacked activity/comments presentation with a tabbed collaboration panel.
- Tab order is fixed as `Bình luận` then `Dòng thời gian`; comments are active by default.
- The comments tab includes the first page of comments and the composer inline. It does not require navigating to a separate comments page.
- The timeline tab shows activity entries with actor, summary, type, and timestamp.
- Both tabs request page 1 first and automatically request the next page as the user reaches the bottom of the list. A loading sentinel, retry state, and end-of-list state are visible. New pages are appended in the API's chronological order and duplicate IDs are ignored.
- The existing `/tasks/:id/comments` route remains available as a direct link/backward-compatible view, but it uses the same paginated behavior and comment composer.

### Notifications

- Make each notification row keyboard-accessible and clickable.
- Add a notification detail route at `/notifications/:id` backed by `GET /notifications/:id`.
- Opening a notification marks it read, then shows title, body, type/channel, timestamp, and metadata in a readable detail card.
- If metadata contains a valid `task_id`, show a link to the task. If it contains a valid `document_id` or `submission_id` with a known target route, show the corresponding link; otherwise metadata remains display-only. Link visibility never bypasses existing authorization.
- Preserve the current list filters, mark-read, mark-all-read, and preference controls.

### Documents

- Treat task as the primary document grouping/filtering dimension. The documents page loads tasks visible to the current user and renders task groups with the task title and its attached documents.
- Show effective task-scoped permission chips for each document (`PREVIEW`, `DOWNLOAD`, `SHARE`, etc.) instead of implying access from ownership alone. Reuse the permission-bearing task document response and do not invent permissions on the client.
- Keep a legacy `Chưa gắn task` group for documents returned by the existing document list that have no visible task association; this prevents silently hiding existing data while making task grouping the normal path.
- Add a required task selector to the global upload form. The selector is populated from tasks the current user can view; the chosen task is sent as `task_id` and the upload uses the existing task-scoped grants shape. The server remains authoritative for attach and grant authorization.
- Keep task-detail upload behavior unchanged except for the shared permission/status wording.

## Data flow and interfaces

### Pagination client

The current `gatewayClient.getList` intentionally discards pagination metadata. Add a typed page method that preserves both `items` and `pagination`, while retaining `getList` for existing callers. Task activity/comments/notifications/document-group loading use the page method with explicit `page` and `page_size` query parameters.

The page metadata must support at least `page`, `page_size`, `has_next`, and `total`. A page loader owns `page`, `items`, `hasNext`, `loading`, and `error` so changing task ID or notification filter resets stale data.

### Task response types

Add the backend-aligned child summary fields to the frontend task model (`children`, `completion_percentage`, `child_task_count`, `approved_child_task_count`, and `completion_color` where returned). Keep `AncestorTaskSummary` separate because ancestor oversight remains summary-only.

### Upload task selection

The global documents page uses `tasksApi.list` to obtain visible tasks and `documentsApi.list` plus task-document requests to build grouped display data. Upload submits the selected task ID and grants for the signed-in user, task creator, assignee, and reviewer where present, matching the existing task-detail upload behavior. The backend's existing `/documents/upload` metadata handling performs the actual association and authorization.

## Error handling and authorization

- A 403 task response continues to render the permission-denied state; it must not be converted into an empty tree, empty timeline, or empty document group.
- A failed later page preserves already loaded entries and shows an inline retry action for that tab.
- A failed task-document group is isolated to that group and does not hide other task groups.
- Client links are convenience navigation only; all destination APIs continue to enforce task/document/notification ownership and permissions.
- Upload rejects missing task selection and files over 25 MB before sending the request.

## Files and boundaries

- `frontend/web/src/api/client.ts`: typed paginated response helper.
- `frontend/web/src/api/tasks.ts`: paginated activity/comments/participants/children requests and typed task response usage.
- `frontend/web/src/api/notifications.ts`: single-notification and paginated list methods.
- `frontend/web/src/api/documents.ts`: paginated document/task-document methods where needed.
- `frontend/web/src/types/task.ts`, `notification.ts`, `document.ts`: backend-aligned response types.
- `frontend/web/src/features/tasks/task-detail.tsx` plus focused task collaboration/tree components and CSS: Lark-like task context, children tree, tabs, and pagination UI.
- `frontend/web/src/features/tasks/task-comments.tsx`: reuse the paginated comments behavior for the direct comments route.
- `frontend/web/src/features/notifications/notification-list.tsx` and a notification detail feature/page: clickable notifications and detail view.
- `frontend/web/src/features/documents/document-list.tsx` and document styles: task grouping, permission chips, and task-aware upload.
- `frontend/web/src/app/(workspace)/notifications/[id]/page.tsx`: notification detail route.
- Existing backend task/document/notification controllers are reused because their pagination, task tree, metadata, and upload association contracts already exist.

## Verification strategy

- Unit/component tests cover child rendering from `task.children`, role-labelled participants, default comments tab, tab switching, pagination append/retry/end states, and stale-request protection.
- Notification tests cover clickable rows, mark-read on detail load, metadata target links, and non-target metadata rendering.
- Document tests cover task grouping, permission chips, required task selection, upload payload (`task_id` and grants), and isolated group failure.
- Run the focused frontend Vitest suites, frontend lint/type/build checks, and existing backend contract/integration tests for task, document upload, notification pagination, and permission behavior.

