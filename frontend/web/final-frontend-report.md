# Final frontend report

## Scope, phases, branch, commits

- Scope: `frontend/web/` only. No backend, gateway, Docker, database, mobile, contracts, or Prisma files were changed.
- Branch: `feat/web-ui-taskdoc` (existing working branch). No branch, commit, push, or PR was created.
- Phase summary: Phase 1 foundation preserved; Phase 2 tasks/documents preserved; Phase 3 grants/notifications preserved; this delivery completes the available Phase 4 administration/monitoring and Phase 5 records/transfer-package surfaces, then performs Phase 6 static/hardening evidence.
- Out of scope by verified boundary: Retention/Disposal has a controller but no Gateway prefix. Audit has no UI because its read/write routes lack suitable authorization/field review; no audit-event writer was built. `/api/security/*` is proxied but forbidden to browser UI.

## Completed Web routes

| Route | UX role | Surface |
|---|---|---|
| `/login`, `/workspace` | authenticated | session and shell |
| `/tasks`, `/tasks/[id]` | EMPLOYEE | direct task work; ancestor summary stays request-isolated |
| `/documents`, `/documents/[id]` | EMPLOYEE | metadata, upload, preview metadata, ticket download |
| `/grants`, `/grants/[id]`, `/notifications` | EMPLOYEE | server-result-based grants and notification preferences |
| `/admin/users` | ADMIN UX only | users, lock/unlock, capability changes |
| `/admin/monitoring` | ADMIN UX only | alerts and rules; no security-event writer |
| `/records`, `/records/[id]` | EMPLOYEE | record creation, entries, seal confirmation |
| `/transfer-packages`, `/transfer-packages/[id]` | EMPLOYEE | submit/receive/accept/reject/archive confirmations |

ADMIN navigation excludes task, document, grant, record, and archival-custody workflows. EMPLOYEE navigation excludes users and monitoring. These are presentation guards, never authorization claims.

## Endpoint matrix

All browser requests use typed `gatewayClient` and same-origin `/gateway/*`, which rewrites to the listed Gateway prefix. Controller/service names below are source evidence; unit tests are mock-only transport/presentation evidence.

| Gateway endpoint | Controller → service | DTO/schema | Web use / evidence |
|---|---|---|---|
| `/api/auth/*` | `AuthController` → `AuthService` | auth schemas | login, refresh, logout; session/client tests |
| `/api/tasks` and task subroutes | `TasksController` → `TasksService` | Zod task/comment/submission schemas | tasks UI; direct-vs-ancestor tests |
| `/api/documents` and document subroutes | `DocumentsController` → `DocumentsService` | document/version/ticket schemas | documents UI; ticket/error contract tests |
| `/api/permissions/grants*` | `PermissionsController` → `PermissionService` | grant schemas | grants UI; Phase 3 API tests |
| `/api/notifications*` | `NotificationsController` → `NotificationsService` | notification schemas | notifications UI; Phase 3 API/UI tests |
| `/api/users*` | `UsersController` → `UsersService` | create-user/capability Zod schemas, `UserDto` | new `/admin/users` UI |
| `/api/monitoring/alerts*`, `/rules*` | `MonitoringController` → `MonitoringService` | alert/rule schemas, `SecurityAlertDto`, `SecurityRuleDto` | new `/admin/monitoring` UI; `events` intentionally excluded |
| `/api/records*` | `RecordsController` → `DocumentsService` | record/entry schemas, `RecordDto` | new record UI |
| `/api/transfer-packages*` | `TransferPackagesController` → `DocumentsService` | package/rejection schemas, `TransferPackageDto` | new custody UI |

Gateway route evidence is `backend/apps/api-gateway/src/proxy/gateway.controller.ts`. Static audit also reviewed controllers/services/guards/interceptors/middleware under all `backend/apps/**/src`, shared libraries/contracts, source integration tests, and service Prisma schemas; Docker/config were read only to establish the runtime boundary.

## Changed files

- `src/components/app-shell.tsx`
- `src/api/admin.ts`, `src/api/records.ts`
- `src/types/admin.ts`, `src/types/records.ts`
- `src/features/admin/*`, `src/features/records/*`
- `src/app/(workspace)/admin/*`, `src/app/(workspace)/records/*`, `src/app/(workspace)/transfer-packages/*`
- `tests/phase45-api-contracts.test.ts`
- This report.

## Verification results

- `corepack pnpm --filter @c17/web lint`: passed.
- `corepack pnpm --filter @c17/web typecheck`: passed.
- `corepack pnpm --filter @c17/web test`: passed after the Phase 4–5 contract additions, 13 files / 49 tests.
- `corepack pnpm --filter @c17/web test:coverage`: passed; 53.52% statements, 45.75% branches, 48.73% functions, 73.68% lines. This is mock-only/static evidence.
- `corepack pnpm --filter @c17/web build`: passed; generated all routes above.
- `corepack pnpm --filter @c17/web test:e2e`: blocked/deferred. Playwright managed Chromium executable is absent at `chromium_headless_shell-1200`; all four checks fail before browser execution. This is not a pass.
- Static scan found the only `fetch` uses in `src/api/client.ts`, both prefixed `/gateway`; no service-port, `/internal`, `/api/security`, `localStorage`, `object_key`, or console logging call was found in `src`.

Docker/Gateway runtime verification remains deferred: the documented Docker registry blob download ends with EOF, so no actual Gateway request, backend authorization, upload pipeline, or custody transition was validated at runtime.

## Backend gap register

| Domain / endpoint | Source gap and impact | Frontend decision |
|---|---|---|
| Documents list/version routes | `DocumentsController` lacks equivalent permission checks for list/version list/detail/create. Data exposure authorization is unverified. | Keep employee-only UX; do not describe data as permission-verified. |
| Grants `/permissions/grants*` | Controller/service trust caller-supplied actor/grantor and lack ownership/role enforcement. This permits unauthorized grant operations if invoked through a valid JWT. | JWT `sub` is only a prefilled UX hint; server results are reconciled; gap remains visible. |
| Notifications | Controller/service accept caller-supplied recipient/user IDs without ownership enforcement. | Current-user UX filtering only; no ownership claim. |
| Users `/users*` | `UsersController` has no ADMIN guard. Any Gateway-authenticated caller can reach management operations. | ADMIN UX gate and explicit warning; never claim server enforcement. |
| Monitoring alerts/rules | `MonitoringController` has no ADMIN guard; `events` can mutate security state. | ADMIN UX gate; deliberately no events UI. |
| Records read/list/add entry | Mutations partly reject ADMIN and seal checks permission, but list/get/add-entry lack full ownership/access checks. | Employee-only presentation; errors remain denied and runtime validation required. |
| Transfer package read/list | Mutations have ADMIN/capability and service separation checks; read/list lack equivalent ownership/capability guard. | Employee-only UX; no local custody/capability decision. |
| Retention/Disposal | `RetentionDisposalController` is unreachable: Gateway has no `/api/retention-disposal` route. | No UI or workaround. |
| Audit | Gateway route can append/list/verify with no controller role guard and fields have not passed safe metadata review. | No audit UI and no writer. |
| Gateway/Docker/Chromium | Docker registry pull EOF; managed Chromium absent. | Runtime/e2e explicitly blocked/deferred, not represented as validated. |

## Security and role-separation review

The client uses sessionStorage-only token storage through the existing session module, does not put tokens in server props, and centralizes refresh/401 cleanup. New mutations wait for a server response before success UI; seal, submission, receipt, decision, archive, and rejection flows require explicit confirmation. Error text is safe and normalized rather than raw backend responses. No blob, object key, storage URL, ticket, token, or document bytes are displayed by the added surfaces.

## Verdict

**Conditionally ready pending external validation.** The complete public-Gateway frontend surface available to this scope is implemented and local lint/type/unit/coverage/build checks pass. It is not release-ready until managed Chromium and Docker/Gateway runtime checks run successfully and the documented backend authorization gaps are fixed or explicitly accepted.
