# Task Detail Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the task detail screen into a light, collaboration-first panel while preserving every existing API and authorization rule.

**Architecture:** `TaskPeople` owns the compact participant strip and creator-only add form. `TaskDetail` passes the current user and reload callback. `TaskCollaboration` renders one conversation surface with a composer below the thread. CSS modules own layout and visual hierarchy.

**Tech Stack:** Next.js, React, TypeScript, CSS Modules, Vitest.

---

### Task 1: Cover creator-only participant controls

**Files:**
- Modify: `frontend/web/tests/task-detail-hierarchy.test.tsx`
- Modify: `frontend/web/src/features/tasks/task-people.tsx`
- Modify: `frontend/web/src/features/tasks/task-detail.tsx`

- [ ] Write a test that renders a direct task as creator and expects `Thêm người tham gia`.
- [ ] Run `pnpm --dir frontend/web exec vitest run tests/task-detail-hierarchy.test.tsx --no-file-parallelism` and confirm the new expectation fails.
- [ ] Pass `currentUserId`, `canManageParticipants`, and an `onAddParticipant` callback into `TaskPeople`; render the existing `/tasks/:id/participants` form only for the creator.
- [ ] Re-run the test and confirm it passes.

### Task 2: Make collaboration the visual focus

**Files:**
- Modify: `frontend/web/src/features/tasks/task-detail.tsx`
- Modify: `frontend/web/src/features/tasks/task-detail.module.css`
- Modify: `frontend/web/src/features/tasks/task-collaboration.tsx`
- Modify: `frontend/web/src/features/tasks/task-collaboration.module.css`
- Modify: `frontend/web/tests/task-collaboration.test.tsx`

- [ ] Write a test that expects the composer to be in the comment thread and comments to precede the timeline tab.
- [ ] Run `pnpm --dir frontend/web exec vitest run tests/task-collaboration.test.tsx --no-file-parallelism` and confirm it fails.
- [ ] Move the composer into the comment thread, remove the separate comment-route primary action, and place `TaskCollaboration` directly below task metadata and participants.
- [ ] Replace dark document/subtask visual treatment with light neutral cards and reduce repeated section borders.
- [ ] Re-run the collaboration and hierarchy tests and confirm they pass.

### Task 3: Validate the full task surface

**Files:**
- Modify: `frontend/web/src/features/tasks/task-people.module.css`
- Modify: `frontend/web/src/features/tasks/task-detail.module.css`

- [ ] Run `pnpm --dir frontend/web lint`.
- [ ] Run `pnpm --dir frontend/web exec vitest run tests/task-detail-hierarchy.test.tsx tests/task-collaboration.test.tsx tests/task-subtask.test.tsx --no-file-parallelism`.
- [ ] Run `pnpm --dir frontend/web build` and `git diff --check`.
