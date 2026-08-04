# Backend gap report

Static source audit only. This report does not claim runtime verification.

## Critical authorization gaps

| Domain / public Gateway endpoint | Backend issue | Impact |
|---|---|---|
| Grants — `/api/permissions/grants*` | `PermissionsController` and `PermissionService` accept caller-supplied `grantor_id`/`actor_id` and do not enforce authenticated caller ownership or role. | Any authenticated caller may be able to list, create, delegate, inspect, or revoke grants outside their authority. |
| Notifications — `/api/notifications*` | `NotificationsController` and service accept caller-supplied recipient/user IDs, and do not enforce recipient ownership for listing, reading, read-all, or preferences. | Any authenticated caller may be able to access or change another user’s notifications/preferences. |
| Users/capabilities — `/api/users*` | `UsersController` has no ADMIN role guard. | Any Gateway-authenticated caller may be able to list/create users, lock/unlock accounts, or change capabilities. |
| Monitoring alerts/rules — `/api/monitoring/alerts*`, `/rules*` | `MonitoringController` has no ADMIN role guard. | Any Gateway-authenticated caller may be able to view/resolve alerts or create/toggle security rules. |
| Monitoring events — `/api/monitoring/events` | The endpoint is publicly reachable through the authenticated Gateway and accepts caller-supplied actor/rule IDs without ADMIN/internal-only protection. | A caller may be able to fabricate security events and affect alert/session-revocation workflows. |

## Ownership and content-access gaps

| Domain / public Gateway endpoint | Backend issue | Impact |
|---|---|---|
| Documents — list/version routes | `DocumentsController` lacks equivalent permission checks for document list, version list, version detail, and version creation. | Document metadata/version metadata may be exposed or changed without a verified per-document permission decision. |
| Records — `/api/records` read/list/entry routes | Create and seal have partial checks, but list/get/add-entry do not have complete ownership/access enforcement. | An authenticated employee may access or alter records outside their custody. |
| Transfer Packages — `/api/transfer-packages` read/list routes | Mutations contain ADMIN/capability/separation checks, but list/get lack equivalent ownership/capability guard. | Package metadata may be disclosed to unauthorized employees. |

## Public-route and contract gaps

| Domain | Backend issue | Impact |
|---|---|---|
| Retention/Disposal | `RetentionDisposalController` exists but API Gateway has no `/api/retention-disposal` route. | The capability is unreachable by compliant Web clients. |
| Audit | Gateway exposes audit append/list/detail/chain endpoints, but `AuditController` has no role guard. The append endpoint permits client-provided audit event fields. | A browser client could potentially forge audit events; audit read data has not been approved for safe public metadata display. |
| Gateway/Docker runtime | Docker image pulls fail with EOF while downloading registry blobs. | Gateway, service authorization, upload, download-ticket, custody and error behavior are not runtime-validated. |
| Managed Chromium | Playwright managed Chromium executable is absent. | Browser E2E tests cannot run; desktop/tablet behavior is not browser-validated. |

## Recommended backend actions

1. Derive the caller exclusively from validated auth context; never trust body/query actor, recipient, grantor, resolver, or user IDs for authorization.
2. Add explicit ADMIN guards to users, monitoring, and approved audit-read endpoints; make monitoring event recording internal-only.
3. Add per-resource ownership/permission checks to document list/version, record, transfer-package, grant, and notification operations.
4. Remove or internalize browser-reachable audit-event append capability.
5. Add the Gateway retention/disposal route only if that workflow is approved for public clients, then define DTO/authorization contracts.
6. Restore Docker/Gateway and managed-Chromium environments, then execute runtime authorization and E2E tests.
