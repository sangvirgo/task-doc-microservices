# Backend–Frontend contract audit

**Audit date:** 2026-08-03
**Basis:** static read of Gateway, owning controllers/services, contracts, Prisma schemas, current Web source, and existing integration tests. This is not runtime evidence.

## Environment status

The Docker compose stack is blocked before startup. `docker compose --env-file .env.example pull/up` repeatedly fails with an EOF while downloading Docker CloudFront registry blobs. No public Gateway endpoint or containerized Playwright fixture has been exercised in this environment.

The local `.env` may be copied from `.env.example` for a throwaway stack and must remain gitignored. The Web application needs only Gateway configuration; RabbitMQ and MinIO are backend dependencies, never browser targets.

## Gateway public route table

| Browser prefix | Upstream service/base | Web status |
|---|---|---|
| `/api/auth` | authentication `/auth` | public login/register/refresh/logout |
| `/api/users` | user-role `/users` | Gateway JWT only; backend role gap |
| `/api/tasks` | task `/tasks` | Phase 2 |
| `/api/documents` | document `/documents` | Phase 2 |
| `/api/records` | document `/records` | Phase 4 |
| `/api/transfer-packages` | document `/transfer-packages` | Phase 4 |
| `/api/permissions` | permission `/` | Phase 3; do not call internal check |
| `/api/notifications` | notification `/notifications` | Phase 3 |
| `/api/monitoring` | monitoring `/monitoring` | Phase 3 |
| `/api/audit` | audit `/audit` | defer: metadata authorization gap |
| `/api/security` | document-security `/security` | proxied but forbidden to Web |

There is **no** `/api/retention-disposal` Gateway route. The document-management service has `RetentionDisposalController`, but it is unreachable through the required browser Gateway boundary.

## Authentication and identity

- `POST /api/auth/register`, `/login`, `/refresh`, `/logout` are public through Gateway.
- Access JWT currently contains `sub`, `role`, `capabilities`, `iat`, `exp`; access TTL is 1800 seconds and refresh TTL is seven days.
- Authentication currently signs `capabilities: []`. There is no public `/me` endpoint.
- Gateway validates the Bearer token and forwards derived internal identity headers; clients never send them.

## Phase 2 contracts

### Tasks

- `GET /api/tasks` accepts `creator_id`, `assignee_id`, `status`, `parent_task_id`; it returns only direct-participant tasks.
- `GET /api/tasks/:id` returns a full task to a direct participant, otherwise the exact ancestor six-field summary when the caller is an ancestor creator/assignee.
- Direct participant-only routes: participants, comments, activity. Ancestor summary must cause no request to any of them.
- Status endpoint accepts only canonical lifecycle values. Service permits cancellation by creator and start/resume by assignee; submit and review are dedicated endpoints.
- `POST /api/tasks/:id/submit` is assignee + `IN_PROGRESS`; `POST /api/tasks/submissions/:id/review` is creator + `WAITING_REVIEW`; approval requires all child tasks approved.
- Actual 409 observed in source is duplicate participant. Invalid lifecycle actions use 400, not 409.

### Documents

- Upload: `POST /api/documents/upload`, multipart field `file`; metadata fields `title`, `document_type`, `owner_id`, `security_level`, `retention_policy`, `declared_state_secret`.
- Default limit is 25 MiB. Allowed MIME types are PDF, text/plain, octet-stream, PNG, JPEG, DOC and DOCX. Source validation reports 400 for rejected size/MIME; do not claim runtime 413/415 without evidence.
- `GET /api/documents/:id` and `/preview` use a PREVIEW permission check. Ticket request/redeem recheck DOWNLOAD permission.
- Ticket flow: `POST /:id/download-ticket`, then `POST /:id/versions/:version/redeem`. Atomic ticket marking makes redemption single use. Current replay/expired/mismatched ticket behavior is 403, not 409.
- Document and version DTO mappers omit `object_key`; ticket DTO omits it too.
- Gap: list, version-list, version-detail, and version-create controller methods lack the equivalent document permission check. Treat list/version authorization as unverified.

## Phase 3 and 4 contracts/gaps

- Grants, users, notifications, monitoring, and audit routes exist through Gateway. Several owning controllers do not consume `CurrentUser` or enforce role/ownership. Gateway JWT is not equivalent to a verified per-resource authorization rule.
- User capability service prevents ADMIN from holding capabilities, but user management controller has no ADMIN guard.
- Notification list/read/preferences accept caller-supplied recipient/user identifiers without controller ownership checks.
- Monitoring alert/rule endpoints lack controller ADMIN checks. Keep as deferred/UX-guarded until runtime/backend authorization is resolved.
- Records and Transfer Packages exist in document-management. Service enforces some ADMIN/capability/separation rules; use only through Gateway and require runtime verification for custody workflows.
- Retention/Disposal controller exists but is not public through Gateway; it stays out of scope.

## Role and frontend route matrix

| Web area | Intended UX role | Current source evidence | Frontend decision |
|---|---|---|---|
| Tasks, Comments, Documents | EMPLOYEE | TASK actions hard-deny ADMIN; document preview/download calls Permission Service | employee workspace only; direct-participant and ancestor policy applies |
| Grants | EMPLOYEE | Gateway JWT; grant controller does not read CurrentUser | employee workspace only; record authorization gap |
| Notifications | authenticated UX | Gateway JWT; recipient/user ID is caller supplied in controller | expose only with current-user UX filter; record ownership gap |
| Users/capabilities | ADMIN UX | Gateway JWT; users controller has no ADMIN guard | admin workspace only; backend guard gap |
| Monitoring alerts/rules | ADMIN UX | Gateway JWT; monitoring controller has no ADMIN guard | admin workspace only; backend guard gap |
| Audit metadata | ADMIN UX, deferred | Gateway JWT; audit controller has no role guard and can append events | never implement append; defer read UI pending field/authorization review |
| Records/Transfer Packages | EMPLOYEE/custody capability UX | document service checks ADMIN/capability in mutations | employee workspace only; verify runtime later |
| Retention/Disposal | none | controller exists; Gateway has no matching prefix | no Web route/UI; frontend-only blocked |

## Current Web implementation inventory

Present: authenticated shell, Gateway client, session storage/refresh, task list/detail, direct-participant comments/activity/participants, document list/detail/versions/upload/ticket download, CSS Modules/tokens, Dockerfile, and focused tests.

Incomplete: task assignment/participant mutation/submission/review UI, true upload byte progress, Phase 3/4 routes/modules, public-Gateway fixtures, managed Chromium, Docker full-stack verification, and comprehensive security/accessibility evidence.

## Required future verification

1. Restore Docker registry pulls and bring up compose from `.env` copied from `.env.example`.
2. Verify every used endpoint through `http://localhost:3000` only.
3. Replace the current system-Chrome Playwright fallback with managed Chromium and prove installation/launch.
4. Run UUID-suffixed Gateway fixtures, then containerized Web/Gateway Playwright.
5. Resolve or explicitly accept the authorization and status-code gaps above before release.
