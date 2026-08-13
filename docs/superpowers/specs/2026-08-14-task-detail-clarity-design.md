# Task Detail Clarity Design

## Goal

Make the task detail page understandable to non-technical users by making progress, participants, and task actions visible and self-explanatory.

## Confirmed user direction

- Keep the progress visualization, but remove the wording “Vòng đời công việc”; use “Tiến độ công việc”.
- Remove the separate “Thông tin & thao tác khác” card at the bottom.
- Move task actions into a top-right three-dot menu in the task header.
- Make the menu understandable without technical knowledge.
- Show participants as a clear list with names/identifiers and Vietnamese role labels.
- Provide an obvious “+ Thêm người tham gia” action.
- Preserve backend authorization: only users who can modify the task may block/unblock it; only the creator may cancel or add participants.

## Design

### Task header and actions

The task header gets a top-right button that combines the three-dot icon with the visible label “Thao tác”. The button uses `aria-haspopup="menu"`, `aria-expanded`, and a descriptive accessible name so the action is discoverable for keyboard and assistive-technology users.

The menu contains only actions available to the current user and task state:

- “Báo cáo vấn đề / Chặn công việc” for the task creator or current assignee while the task is not blocked or terminal. Selecting it opens a small, plain-language form asking “Vì sao bạn muốn chặn công việc?” and requiring a reason before calling the existing block API.
- “Bỏ chặn công việc” for the task creator or current assignee when the task is blocked.
- “Hủy công việc” for the task creator while the task is not terminal.

The existing backend endpoints and permission checks remain the source of truth. The frontend hides unavailable actions for clarity, while a failed API response is still shown as an inline status message.

### Progress

Keep the existing `TaskProgress` component and behavior. Rename the eyebrow from “Vòng đời công việc” to “Tiến độ công việc” so the card reads as progress information rather than a technical lifecycle model. Preserve the progress step labels, percentages, and accessibility progress semantics.

### Participants

Keep loading participants through the existing `GET /tasks/:id/participants` API. Replace the compact avatar-only emphasis with a readable participant list:

- Section heading: “Người tham gia (N)”.
- Each row shows an avatar/initial, the member email/identifier, and a plain Vietnamese role label.
- Map known roles to “Người tạo”, “Người thực hiện”, “Người duyệt”, and “Người tham gia”. Unknown roles use “Người tham gia” rather than exposing an implementation value.
- Show “+ Thêm người tham gia” as a prominent button for the creator. The existing searchable employee selector and optional role field open inline below the heading with clear labels and “Thêm” / “Hủy” controls.
- Keep duplicate people collapsed into one row and combine their role labels.

### Scope and files

- Modify `frontend/web/src/features/tasks/task-detail.tsx` to own the top action menu, block-reason form state, and action visibility.
- Modify `frontend/web/src/features/tasks/task-detail.module.css` for the header menu, readable typography, focus states, and responsive layout.
- Modify `frontend/web/src/features/tasks/task-people.tsx` and `task-people.module.css` for explicit participant rows and the add-participant panel.
- Modify `frontend/web/src/features/tasks/task-progress.tsx` for the progress wording only.
- Add or update focused frontend tests for menu visibility, block/unblock behavior, participant rendering, and add-participant controls.
- Do not change backend APIs, database schemas, task authorization rules, or unrelated task workflow behavior.

## Interaction and error handling

- The menu opens and closes with mouse, keyboard, Escape, and outside click.
- While an action is pending, its controls are disabled and the existing task notice reports success or the backend error.
- Blocking cannot be submitted with an empty reason; the user remains in the form and sees a plain-language validation message.
- Closing the menu or canceling the block form does not call an API.
- After a successful action or participant add, reload the task so status, participants, and permissions reflect the backend response.

## Acceptance criteria

1. “Vòng đời công việc” is no longer visible on the task detail page; the progress section is labeled “Tiến độ công việc”.
2. No bottom “Thông tin & thao tác khác” card remains.
3. A user can discover task actions from the top-right “Thao tác ⋯” button.
4. A current assignee can see and use block/unblock when backend permissions allow it; an unrelated participant cannot see those actions.
5. A creator can add a participant from a clearly labeled inline form.
6. Participant identity and role are readable without relying on hover tooltips.
7. Focus, keyboard, loading, validation, and API error states are covered by tests.

