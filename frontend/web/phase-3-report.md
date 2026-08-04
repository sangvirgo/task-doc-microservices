# Web Phase Report

## Phase, branch, and role surface

- Phase: 3 — EMPLOYEE grants and notifications.
- Branch: current working branch; no branch was created and no commit, push, or PR was made.
- Scope: `frontend/web/` only. New EMPLOYEE UX routes are `/grants`, `/grants/[id]`, and `/notifications`. ADMIN has no Grants or Notifications navigation, and the Grants routes render a UX-only denied state for an ADMIN session.
- Phase 4 was not started.

## Implemented routes and source-verified endpoints

All browser requests are made only by the centralized typed client to same-origin `/gateway/*`.

| Web route | Gateway endpoint | Method | Implementation behavior |
|---|---|---|---|
| `/grants` | `/gateway/permissions/grants?actor_id=<sub>` | GET | Lists server-returned grants. `sub` is an identity/UX hint only. |
| `/grants` | `/gateway/permissions/grants` | POST | Creates a grant and reloads the server result. |
| `/grants/[id]` | `/gateway/permissions/grants/:id` | GET | Displays server-returned status, requested/effective expiry, and revocation values. |
| `/grants/[id]` | `/gateway/permissions/grants/:id/delegate` | POST | Delegates and reloads the server result. |
| `/grants/[id]` | `/gateway/permissions/grants/:id` | DELETE | Revokes, then displays the returned grant. |
| `/notifications` | `/gateway/notifications?recipient_id=<sub>&unread_only=true` | GET | Lists notifications filtered with the JWT subject as a UX hint. |
| `/notifications` | `/gateway/notifications/:id/read` | POST | Marks one notification read using the server result. |
| `/notifications` | `/gateway/notifications/read-all` | POST | Marks the current UX-filtered recipient's unread items read. |
| `/notifications` | `/gateway/notifications/preferences/:userId` | GET/PUT | Reads and updates preferences using the JWT subject as a UX hint. |

No UI calls `/internal/*`, service ports, `/api/security/*`, databases, storage, queues, or caches. No UI calculates grant authority or expiry; displayed effective-expiry, status, and revocation come from backend responses.

## Files changed and local commits

- `src/api/client.ts` — added typed `PUT` and `DELETE` transport methods within the existing Gateway client.
- `src/api/grants.ts`, `src/api/notifications.ts`, `src/types/grant.ts`, `src/types/notification.ts` — Phase 3 contracts and typed Gateway operations.
- `src/features/grants/*`, `src/features/notifications/*` — EMPLOYEE client UI, server-result reconciliation, error/empty/loading/denied states, responsive CSS.
- `src/app/(workspace)/grants/*`, `src/app/(workspace)/notifications/page.tsx`, `src/components/app-shell.tsx` — routes and EMPLOYEE navigation.
- `tests/phase3-api-contracts.test.ts`, `tests/phase3-ui.test.tsx` — transport and presentation evidence.
- No local commits were made.

## Local verification

- lint: `corepack pnpm --filter @c17/web lint` — passed.
- typecheck: `corepack pnpm --filter @c17/web typecheck` — passed.
- unit/component tests: `corepack pnpm --filter @c17/web test` — passed, 12 files / 47 tests.
- coverage: `corepack pnpm --filter @c17/web test:coverage` — passed; total 53.52% statements, 45.75% branches, 48.73% functions, 73.68% lines. Phase 3 typed APIs are 100% statement-covered; UI tests cover server-result rendering, empty notification response, and ADMIN Grants exclusion.
- managed-Chromium local browser checks: `corepack pnpm --filter @c17/web test:e2e` — blocked/deferred. Playwright could not launch the managed executable: `browserType.launch: Executable doesn't exist at C:\Users\sonvt\AppData\Local\ms-playwright\chromium_headless_shell-1200\chrome-headless-shell-win64\chrome-headless-shell.exe`.
- build: `corepack pnpm --filter @c17/web build` — passed; output contains `/grants`, `/grants/[id]`, and `/notifications`.

## Mock-only evidence and runtime verification deferred

The unit/component tests stub minimal transport/UI responses only to isolate client behavior. They prove Gateway path construction, safe normalized failure presentation, and response-derived display; they do not prove Gateway routing or backend authorization.

No Docker stack or public Gateway runtime endpoint was verified. Docker remains blocked/deferred by the documented image-pull issue: Docker CloudFront registry blob download ends with `EOF`. No attempt was made to alter Docker, Gateway, backend, or infrastructure.

## Backend gaps and assumptions

- Gateway has public JWT-protected prefixes for `/api/permissions` and `/api/notifications`, mapping to the Permission and Notification services.
- `PermissionsController` has no `CurrentUser`, role guard, or ownership check. It accepts client body `grantor_id` and `actor_id`; list accepts `actor_id`; get/delegate/revoke accept any grant ID. `PermissionService` also creates/delegates/revokes without caller authorization. This is a backend authorization gap, not resolved or worked around by this frontend.
- `NotificationsController` has no `CurrentUser` or ownership guard. List and read-all accept caller-supplied `recipient_id`; preferences accept caller-supplied `userId`; get and mark-read accept any notification ID. `NotificationsService` does not enforce recipient ownership. This is a backend authorization gap.
- JWT `sub` is used solely as a prefilled UX filter/transport value required by the current DTOs. It is never treated as proof that the caller owns an actor, recipient, notification, preference, or grant.
- The backend DTO does not expose `revocation_reason`; the UI correctly does not invent or display one. The server does return `expires_at`, `effective_expires_at`, `status`, and `revoked_at`.

## Security and role-separation review

- ADMIN navigation omits Tasks, Documents, Grants, Notifications, Records, and Transfer Packages. Phase 3 did not add any ADMIN content workflow.
- Grants UI renders no local permission/expiry decision and handles failed mutations as failed server requests; it does not show success before receiving the response.
- Notification list and preferences avoid exposing metadata fields. UI does not log tokens, tickets, object keys, storage URLs, document bytes, raw backend errors, or sensitive metadata.
- Frontend role gates remain presentation/UX only. Backend denial remains authoritative, and the missing backend guards above must be fixed or explicitly accepted before release.

## Required user approval for the next phase

Verdict: **not ready**.

Do not start Phase 4. Before any next phase or release decision, the backend must add and validate authenticated caller ownership/role enforcement for Grant and Notification routes, then public Gateway and managed-Chromium checks must run successfully. The current static and mock-only frontend evidence cannot validate those external controls.
