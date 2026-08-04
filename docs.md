# FE Web / Backend Revalidation Notes

Last checked: 2026-08-04

## Scope

This pass was source/build verification only. No deployment, Docker image pull, browser session, Chromium, or Playwright run was used.

## FE pages covered

The following routes compile: /login, /workspace, /tasks, /tasks/[id], /documents, /documents/[id], /records, /records/[id], /transfer-packages, /transfer-packages/[id], /grants, /grants/[id], /notifications, /retention-disposal, /admin/users, /admin/monitoring, and /admin/audit.

The visual refresh is global across globals.css, tokens, app-shell styles, and feature styles. It standardizes the light theme, typography, spacing, cards, tables, controls, focus states, status chips, responsive behavior, empty/error/loading states, and Jira-like navigation surfaces.

Implemented FE changes:

- Login exposes employee registration through POST /auth/register.
- Document upload has a dropzone-style control, metadata grid, helper text, and modern action footer.
- Task create/assign/participant flows use employee email dropdowns from /users/directory; UUIDs are not shown in those flows.
- Multipart document upload assigns ownership from the authenticated user; the user no longer enters owner_id.
- Task detail uses member choices and resolves assignee/participant labels to email where available.
- Removed stale backend-warning notices from Grants and Notifications; the actual controllers enforce ownership checks.

## Auth/session status

Refresh-token rotation already existed in the backend at POST /auth/refresh and is used by the FE client on authenticated 401 responses. The FE shares one refresh promise, stores the rotated pair, clears the session on failure, and redirects to login with a session-expired reason. Logout revokes the refresh token and clears local state. Public registration is limited by backend policy to EMPLOYEE accounts.

## Backend checks

The repository generation helper currently calls pnpm directly and fails in this Windows shell with spawnSync pnpm ENOENT. Running the equivalent Corepack Prisma generate command for every schema succeeded locally.

After generation, corepack pnpm --filter backend build passed all 10 applications: api-gateway, authentication-identity-service, user-role-management-service, task-management-service, document-management-service, document-security-service, permission-service, audit-log-service, notification-service, and security-monitoring-service.

The member directory is minimal (id and email) and gateway policy keeps the full /users management API administrator-only. Controllers checked include auth refresh/register/logout, gateway policy, task authorization, document ownership/permissions, grants visibility, notification recipient/preferences ownership, and secure download tickets.

## Verification results

Passed:

- corepack pnpm --filter web build
- corepack pnpm --filter web test -- --run (15 test files, 51 tests passed; Chromium/Playwright excluded)
- corepack pnpm --filter backend build after local Prisma generation (10/10 applications built)
- git diff --check

Not run by design:

- Chromium/Playwright visual tests because Chromium is unavailable/broken
- Docker compose, deployment, image pull, live API smoke tests, and database migrations

## Known limitations / follow-up

1. A few FE workflows still use raw document/task/resource IDs where the backend contract requires UUIDs, especially retention/disposal and some grant/resource detail forms. Convert these to entity pickers when scoped list APIs are exposed.
2. Registration creates the account in the authentication database. There is no verified event/consumer sync guaranteeing that a newly registered account immediately appears in the user-role member directory; seeded/admin-created directory members work, but registration-to-directory synchronization remains a backend follow-up.
3. Backend builds depend on generated Prisma clients. The Windows/Corepack-safe generation helper should be fixed before onboarding another Windows contributor.
4. No live browser pass was possible, so pixel-level rendering across every viewport remains unverified even though Next.js build/type checks pass.

## Handoff

For future FE changes, update typed API modules and contract tests together, then run the web build and targeted Vitest tests. Keep server authorization authoritative; do not replace it with client-only checks.
