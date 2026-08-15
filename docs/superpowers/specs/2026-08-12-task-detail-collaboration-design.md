# Task Detail Collaboration Design

## Goal

Make the direct task-detail view feel like a light Lark-style work panel: collaboration is immediately visible, task metadata is compact, and secondary task operations do not dominate the page.

## Decisions

- Keep the existing task, participant, comment, activity, document, and directory APIs unchanged.
- Replace the participant card grid with an avatar strip. The task creator gets an inline `+ Thêm người` control that expands a compact selector and optional role input. Other direct participants see the same people without the mutation control.
- Remove the separate comments route as the primary action. The direct-task page opens on the inline conversation area, with comments first and the timeline as the second tab.
- Compose comments in the same conversation panel, below the loaded comments, rather than in a competing right-side card.
- Use a single bright surface with restrained dividers. Sub-tasks and documents use neutral cards, never dark panels.
- Keep task lifecycle forms and destructive actions collapsed under secondary controls.

## Permission Behavior

The backend requires both `TASK_ASSIGN` and task-creator identity to add a participant. The frontend therefore renders the add-participant control only when the session user is the task creator. A failed add request remains visible as a contextual notice.

## Verification

- A creator sees and can submit the inline participant form.
- A non-creator never sees the participant mutation form.
- The task detail keeps comments before timeline and has one unified comment surface.
- Existing sub-task, document, hierarchy, workflow, and collaboration tests continue to pass.
