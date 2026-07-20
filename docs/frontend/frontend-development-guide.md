# Web and Flutter Mobile Development and API Integration Guide

## 1. Purpose

This is the authoritative integration guide for the two frontend clients of the C17 Task
and Secure Document Platform:

- **Next.js Web** (`frontend/web/`) — TypeScript responsive web application
- **Flutter Mobile** (`frontend/mobile/`) — Dart native mobile application

Both applications consume the same backend through the API Gateway. This guide documents
the verified public API contracts, authentication flow, authorization rules, domain
models, and integration patterns.

## 2. Application Boundaries

| Application | Path | Technology | Primary target |
|---|---|---|---|
| Web | `frontend/web/` | Next.js + TypeScript | Desktop/laptop browser |
| Mobile | `frontend/mobile/` | Flutter + Dart | Android/iOS |

Web and Flutter are separate applications with separate source code, build systems,
dependencies, UI components, routing/navigation, state management, release processes,
and typed API clients. They share public backend API contracts, domain terminology,
authentication rules, role and capability rules, canonical enums and statuses, security
requirements, upload/download workflows, and error-handling expectations.

## 3. Source-of-Truth Order

When documentation and runtime contracts disagree, the frontend must not guess. The
discrepancy must be reported.

1. API Gateway public routes (`backend/apps/api-gateway/src/proxy/gateway.controller.ts`)
2. Public controller decorators (individual service controllers)
3. DTOs/contracts/enums (`backend/libs/contracts/`)
4. Authorization implementation (permission checks, role guards)
5. Accepted ADRs in `docs/adr/`
6. `CONTEXT.md` (domain vocabulary)
7. Current verified backend reports
8. This frontend guide

Do not use stale planning documents as runtime truth.

## 4. API Gateway-Only Rule

Both Web and Flutter must:

- Call the **API Gateway only** (default: `http://localhost:3000`)
- Never call service ports 3001–3009 directly
- Never call `/internal/*` endpoints
- Never query PostgreSQL, Redis, or RabbitMQ directly
- Never connect to ClamAV directly
- Never connect to MinIO/S3/R2 directly
- Never receive object-storage credentials
- Never receive KEKs (Key-Encrypting Keys)
- Never send trusted backend identity headers (`x-user-id`, `x-user-role`, `x-user-capabilities`)
- Never fabricate capabilities or roles

The API Gateway strips the `/api/<service>` prefix and forwards requests to the
appropriate internal service. The Gateway adds `x-user-id`, `x-user-role`, and
`x-user-capabilities` headers from the validated JWT — clients must never send these.

## 5. Shared Domain Modules

The following domains are implemented in the backend and available to both frontend
applications through the API Gateway:

- **Authentication** — registration, login, refresh, logout
- **Users and capabilities** — user CRUD, lock/unlock, capability grant/revoke
- **Tasks** — task CRUD, lifecycle transitions, assignment, blocking
- **Task participants** — add/get participants
- **Comments** — list and create task comments
- **Task Activity** — append-only activity log
- **Submissions and reviews** — submit task results, review submissions
- **Documents** — document CRUD, versions, preview
- **Secure upload** — multipart upload through Security Pipeline
- **Secure download** — ticket-based two-step download
- **Permission Grants** — create, list, get, delegate, revoke
- **Notifications** — list, mark read, preferences
- **Security Alerts** — list, get, resolve (ADMIN only)
- **Records** — create, list, get, add entries, seal
- **Transfer Packages** — create, submit, receive, accept, reject, archive, list, get
- **Retention** — check eligibility, place/release holds, list holds
- **Disposal** — approve, execute, list approvals
- **Audit Trail** — list events, get event, verify chain (admin/metadata only)

## 6. Authentication Contract

### Public Endpoints

| Operation | Gateway Path | Method | Auth | Request Body | Response | Owning Service |
|---|---|---|---|---|---|---|
| Register | `/api/auth/register` | POST | No | `{ email, password, role? }` | `{ id, email, role }` | authentication-identity-service |
| Login | `/api/auth/login` | POST | No | `{ email, password }` | `{ access_token, refresh_token, expires_in_seconds }` | authentication-identity-service |
| Refresh | `/api/auth/refresh` | POST | No | `{ refresh_token }` | `{ access_token, refresh_token, expires_in_seconds }` | authentication-identity-service |
| Logout | `/api/auth/logout` | POST | No | `{ refresh_token }` | 204 No Content | authentication-identity-service |

### Token Details

- Access token TTL: 30 minutes (1800 seconds)
- Refresh token TTL: 7 days
- Refresh rotation: old refresh token is revoked, new pair issued on each refresh
- Account locking: locked users cannot log in or refresh (backend returns 401)
- Session revocation: logout revokes the current refresh token; account locking revokes all active sessions

### Register Schema

```json
{
  "email": "string (email format, required)",
  "password": "string (min 8 chars, required)",
  "role": "ADMIN | EMPLOYEE (default: EMPLOYEE)"
}
```

### Login Schema

```json
{
  "email": "string (email format, required)",
  "password": "string (min 1 char, required)"
}
```

### Login Response

```json
{
  "access_token": "JWT string",
  "refresh_token": "UUID string",
  "expires_in_seconds": 1800
}
```

### Errors

| Code | Meaning |
|---|---|
| 400 | Invalid request format |
| 401 | Invalid credentials, account locked, expired/revoked token |

### Web Authentication

- Token transport: `Authorization: Bearer <access_token>` header
- Refresh token: stored in browser; sent in request body for refresh/logout
- Recommended storage: decide based on security requirements (localStorage, sessionStorage, or HttpOnly cookies)
- On 401: clear stored tokens, redirect to `/login`
- Do not retry failed requests automatically

### Flutter Authentication

- Token transport: `Authorization: Bearer <access_token>` header
- Token storage: use platform-backed secure storage (e.g., `flutter_secure_storage`)
- On refresh: update stored refresh token from response
- On 401: clear tokens, navigate to login screen
- Handle locked accounts and revoked sessions gracefully

## 7. Roles and Authorization

### System Roles

| Role | Access |
|---|---|
| ADMIN | Platform administration — users, roles, capabilities, lock/unlock, alerts, audit metadata |
| EMPLOYEE | Content participation — Tasks, Documents, Grants, Records, Transfer Packages |

### ADMIN Restrictions

ADMIN must never:

- Create, view, or participate in Tasks
- View or download Document content
- List or create Comments
- Hold or use any content-adjacent Grant
- Submit, receive, accept, or reject Transfer Packages
- Approve or execute Disposal
- Hold any Capability (ARCHIVE_SUBMIT, ARCHIVE_RECEIVE, DISPOSAL_APPROVE)

ADMIN can manage users, grant/revoke capabilities, lock/unlock accounts, view
security alerts, and resolve alerts.

### Direct Task Participants

A user has access to a Task's full detail (comments, submissions, reviews, activity)
only if they are one of:

- The task **Creator** (the user who raised the task)
- The current task **Assignee** (the user accountable for completion)
- An explicitly assigned **Participant**

### What Does NOT Grant Access

- Mentions in Comments (purely a notification routing concern)
- Subscriptions (standing notification request, no access conferred)
- Notification recipients
- ADMIN role
- Capability-management authority

### Ancestor Oversight

The Creator or current Assignee of an ancestor task may view a six-field summary of
descendant tasks. The summary contains exactly:

- `title`
- `status`
- `assignee`
- `deadline`
- `is_overdue`
- `completion_result`

Ancestor oversight does not grant access to descendant Comments, Documents, or
activity beyond the summary fields.

### Frontend Route Guards

Frontend route guards are UX only. Backend authorization is authoritative. Never hide
a backend 403 by pretending the action succeeded.

## 8. Canonical Task Lifecycle

### Statuses

| Status | Description |
|---|---|
| `CREATED` | Task created, not yet assigned |
| `ASSIGNED` | Task assigned to an Assignee |
| `IN_PROGRESS` | Work is underway |
| `WAITING_REVIEW` | Result submitted, awaiting review |
| `APPROVED` | Task completed and accepted (terminal) |
| `NEED_REVISION` | Reviewer requested changes; returns to `IN_PROGRESS` |
| `REJECTED` | Task rejected (terminal) |
| `CANCELLED` | Task cancelled (terminal) |

### Valid Transitions

```
CREATED      → ASSIGNED, CANCELLED
ASSIGNED     → IN_PROGRESS, CANCELLED
IN_PROGRESS  → WAITING_REVIEW, CANCELLED
WAITING_REVIEW → APPROVED, NEED_REVISION, REJECTED, CANCELLED
NEED_REVISION → IN_PROGRESS, CANCELLED
APPROVED     → (terminal)
REJECTED     → (terminal)
CANCELLED    → (terminal)
```

### Additional Conditions

- `BLOCKED` is an orthogonal condition (stored as boolean + reason), not a lifecycle status
- `is_overdue` is derived on read: `deadline < now AND status NOT IN (APPROVED, REJECTED, CANCELLED)`
- Frontend must not invent additional status values
- Frontend must not submit arbitrary status strings
- UI actions must follow valid backend transitions
- Only the task Creator may cancel
- Only the current Assignee may start/resume work (transition to IN_PROGRESS)
- Only the current Assignee may submit
- Only the task Creator may review submissions
- Parent task approval requires all child tasks to be APPROVED

### Submission and Review

- Only the current Assignee may submit (status must be IN_PROGRESS)
- Submission transitions task to WAITING_REVIEW
- Only the task Creator may review
- Review decisions: APPROVED, NEED_REVISION, REJECTED
- APPROVED requires all child tasks to be APPROVED first

## 9. Task Confidentiality and Ancestor Oversight

### Full Detail Access

Only direct participants (Creator, Assignee, explicit Participant) may view full task
detail including Comments, submissions, reviews, and activity.

### Ancestor Oversight Response

When a user is an ancestor Creator or Assignee but not a direct participant, the
backend returns an `AncestorTaskSummaryDto` instead of the full `TaskDto`:

```json
{
  "title": "string",
  "status": "string",
  "assignee": "string | null",
  "deadline": "string | null",
  "is_overdue": "boolean",
  "completion_result": "string | null"
}
```

Ancestor oversight is a summary projection, not a relaxed permission. It does not
grant access to descendant Comments, Documents, or activity.

### Comment Access

- Only direct task Participants may list or create Comments
- ADMIN is denied both operations unconditionally
- Comment content is confidential and must never appear in Audit events

### Child Task Rules

- The Assignee of a parent task becomes the Creator of the Child Task
- Every Child Task is required — a parent cannot be APPROVED until all children are APPROVED
- A Child Task's Creator reviews the Child Task

## 10. Document Upload

### Upload Endpoint

**Multipart upload:**

```
POST /api/documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | file | Yes | The document file |
| `title` | string | Yes | Document title |
| `document_type` | string | Yes | Document type identifier |
| `owner_id` | UUID | Yes | Owner user ID |
| `security_level` | string | No | `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, or `RESTRICTED` (default: `INTERNAL`) |
| `retention_policy` | string | No | Retention policy identifier |
| `declared_state_secret` | boolean | No | If `true`, upload is rejected before any processing |

**Size limit:** Configured per deployment (`MAX_UPLOAD_BYTES`).

**MIME allowlist:** Configured per deployment.

### Normal Security Levels

- `PUBLIC`
- `INTERNAL`
- `CONFIDENTIAL`
- `RESTRICTED`

### State-Secret Declarations

State-secret material is a separate policy value, not a `SecurityLevel` enum member.
Rules:

- Never place state-secret labels into the normal `SecurityLevel` enum
- UI must clearly prevent intentional upload of state-secret material
- Backend rejects the request before any Document is created
- Do not implement keyword-based or AI-based legal classification

### Response

```json
{
  "document": {
    "id": "uuid",
    "title": "string",
    "document_type": "string",
    "owner_id": "uuid",
    "creator_id": "uuid",
    "security_level": "string",
    "status": "string",
    "current_version": 1,
    "retention_policy": "string | null",
    "archive_status": "string | null",
    "record_id": "string | null",
    "created_at": "ISO 8601",
    "updated_at": "ISO 8601"
  },
  "version": {
    "id": "uuid",
    "document_id": "uuid",
    "version": 1,
    "checksum": "string",
    "file_size": 12345,
    "mime_type": "string",
    "created_by": "uuid",
    "created_at": "ISO 8601"
  }
}
```

### Failure Status Codes

| Code | Meaning |
|---|---|
| 400 | Validation error, state-secret declared, or security processing failed |
| 401 | Authentication required |
| 413 | File size exceeded |
| 415 | Unsupported MIME type |

### Web Upload UX

- Browser file picker
- Client-side validation (file size, MIME type)
- Multipart request with progress when supported
- Show scanning/processing state
- Safe cancellation — clean up on failure
- No persistent plaintext cache of uploaded content

### Flutter Upload UX

- Platform file picker (Android/iOS)
- Sandbox and permission handling
- Multipart request with progress
- Temporary-file cleanup after upload
- No direct object-storage upload

### Never Display

- `object_key`
- Encryption key, IV, or authentication tag
- ClamAV internals
- Backend stack traces

## 11. Secure Download

Downloads use a two-step ticket flow.

### Step 1: Request Download Ticket

```
POST /api/documents/:id/download-ticket
Authorization: Bearer <token>
Content-Type: application/json

{
  "version": 1,
  "expires_in_seconds": 3600
}
```

**Response:**

```json
{
  "id": "ticket-uuid",
  "document_id": "document-uuid",
  "version": 1,
  "actor_id": "user-uuid",
  "expires_at": "2026-07-31T12:00:00.000Z"
}
```

### Step 2: Redeem Ticket

```
POST /api/documents/:id/versions/:version/redeem
Authorization: Bearer <token>
Content-Type: application/json

{
  "ticket_id": "ticket-uuid"
}
```

**Response:** Binary file stream (`application/octet-stream` or actual MIME type).

### Download Rules

- Ticket is single-use — once redeemed, it cannot be reused
- Ticket expires after the specified duration or the Grant's effective expiry, whichever is sooner
- Permission is rechecked at redemption time
- Do not cache tickets longer than necessary
- Do not reuse a redeemed ticket
- Do not expose or request `object_key`
- Do not generate direct MinIO/S3/R2 URLs

### Download Errors

| Code | Meaning |
|---|---|
| 403 | Permission denied (Grant expired, revoked, or missing) |
| 404 | Document or ticket not found |
| 409 | Ticket already used, actor mismatch, or resource mismatch |
| 503 | Document security service unavailable |

### Web Download Handling

- Receive Blob/binary response
- Use a temporary Blob URL when needed
- Revoke Blob URL after use
- Do not keep private content in persistent cache

### Flutter Download Handling

- Receive bytes/stream through Gateway
- Save to application sandbox or user-approved destination
- Clean temporary files
- Avoid automatic redemption retry
- Never log document bytes

## 12. Permission Grants

### Grant Endpoints

| Operation | Gateway Path | Method | Auth | Request | Response |
|---|---|---|---|---|---|
| Create grant | `/api/permissions/grants` | POST | JWT | `{ grantor_id, actor_id, resource_type, resource_id, permissions[], task_id, expires_at, parent_grant_id? }` | `GrantDto` |
| List grants | `/api/permissions/grants` | GET | JWT | Query: `actor_id`, `resource_type`, `resource_id`, `status`, `task_id` | `GrantDto[]` |
| Get grant | `/api/permissions/grants/:id` | GET | JWT | — | `GrantDto` |
| Delegate grant | `/api/permissions/grants/:id/delegate` | POST | JWT | `{ actor_id, permissions? }` | `GrantDto` |
| Revoke grant | `/api/permissions/grants/:id` | DELETE | JWT | `{ reason? }` | `GrantDto` |

### GrantDto

```json
{
  "id": "uuid",
  "grantor_id": "uuid",
  "actor_id": "uuid",
  "resource_type": "string",
  "resource_id": "uuid",
  "permissions": ["string"],
  "task_id": "uuid",
  "expires_at": "ISO 8601",
  "effective_expires_at": "ISO 8601",
  "status": "string",
  "revoked_at": "ISO 8601 | null",
  "parent_grant_id": "uuid | null",
  "created_at": "ISO 8601"
}
```

### Grant Rules

- Every ordinary Grant requires a `task_id` — no access without a Task
- `effective_expires_at` is computed at Grant creation: `min(expires_at, task.deadline, parent_grant.effective_expires_at)`
- Extending a task deadline never widens an existing Grant
- Delegated Grants cannot carry permissions the parent lacks
- Delegated Grants cannot outlive the parent's effective expiry
- Revocation cascades to all descendant Grants
- Expired and revoked Grants deny all access including VIEW
- Frontend displays backend decisions and must not calculate final authorization locally

### Internal Endpoints — Frontend Forbidden

| Method | Internal Path | Purpose |
|---|---|---|
| POST | `/internal/permissions/check` | Service-to-service permission check |

## 13. Notifications

### Notification Endpoints

| Operation | Gateway Path | Method | Auth | Request | Response |
|---|---|---|---|---|---|
| List notifications | `/api/notifications` | GET | JWT | Query: `recipient_id` (required), `unread_only` | `NotificationDto[]` |
| Get notification | `/api/notifications/:id` | GET | JWT | — | `NotificationDto` |
| Mark as read | `/api/notifications/:id/read` | POST | JWT | — | `NotificationDto` |
| Mark all as read | `/api/notifications/read-all` | POST | JWT | `{ recipient_id }` | `{ count }` |
| Get preferences | `/api/notifications/preferences/:userId` | GET | JWT | — | `NotificationPreferenceDto` |
| Update preferences | `/api/notifications/preferences/:userId` | PUT | JWT | `{ email_enabled?, in_app_enabled? }` | `NotificationPreferenceDto` |

### NotificationDto

```json
{
  "id": "uuid",
  "recipient_id": "uuid",
  "type": "string",
  "title": "string",
  "body": "string",
  "channel": "IN_APP | EMAIL",
  "read_at": "ISO 8601 | null",
  "metadata": "object | null",
  "created_at": "ISO 8601"
}
```

### Notification Types (from event consumers)

- `TASK_ASSIGNED` — when a task is created with an assignee
- `SECURITY_SESSION_REVOKED` — when sessions are revoked (logout or security lock)
- `SECURITY_ALERT` — when a security alert is raised
- `GRANT_EXPIRED` — when a document access grant expires

### Current Implementation Status

- Notification events are consumed from RabbitMQ (task-created, session-revoked, security-alert-created, grant-expired)
- In-app notification records are created automatically from domain events
- Email adapter exists but no SMTP integration — no real email delivery
- No mobile push notifications (FCM/APNs) — not implemented

## 14. Security Alerts

### Public Endpoints

| Operation | Gateway Path | Method | Auth | Request | Response |
|---|---|---|---|---|---|
| List alerts | `/api/monitoring/alerts` | GET | JWT | Query: `status`, `severity`, `actor_id`, `rule_id` | `SecurityAlertDto[]` |
| Get alert | `/api/monitoring/alerts/:id` | GET | JWT | — | `SecurityAlertDto` |
| Resolve alert | `/api/monitoring/alerts/:id/resolve` | POST | JWT | `{ resolved_by }` | `SecurityAlertDto` |

### SecurityAlertDto

```json
{
  "id": "uuid",
  "rule_id": "uuid",
  "severity": "MEDIUM | HIGH",
  "actor_id": "uuid | null",
  "description": "string",
  "metadata": "object | null",
  "status": "OPEN | RESOLVED",
  "resolved_at": "ISO 8601 | null",
  "resolved_by": "uuid | null",
  "created_at": "ISO 8601"
}
```

### Role/Capability Restrictions

- Alert listing and resolution are available to authenticated users
- Security rule management (`POST /api/monitoring/rules`, `GET /api/monitoring/rules`,
  `PUT /api/monitoring/rules/:id/toggle`) is for administrative use
- Internal event-recording endpoint (`POST /api/monitoring/events`) is not exposed to clients

## 15. Records and Transfer Packages

### Record Endpoints

| Operation | Gateway Path | Method | Auth | Request | Response | Rules |
|---|---|---|---|---|---|---|
| List records | `/api/records` | GET | JWT | Query: `creator_id`, `status` | `RecordDto[]` | — |
| Create record | `/api/records` | POST | JWT | `{ title, description? }` | `RecordDto` | ADMIN denied |
| Get record | `/api/records/:id` | GET | JWT | — | `RecordDto` | — |
| Add entry | `/api/records/:id/entries` | POST | JWT | `{ document_id, document_version_id }` | entry | ADMIN denied |
| Seal record | `/api/records/:id/seal` | POST | JWT | — | `RecordDto` | ADMIN denied; requires TRANSFER action |

### Transfer Package Endpoints

| Operation | Gateway Path | Method | Auth | Required Capability | Request | Response |
|---|---|---|---|---|---|---|
| Create package | `/api/transfer-packages` | POST | JWT | ARCHIVE_SUBMIT | `{ record_id }` | `TransferPackageDto` |
| Submit package | `/api/transfer-packages/:id/submit` | POST | JWT | ARCHIVE_SUBMIT | — | `TransferPackageDto` |
| Receive package | `/api/transfer-packages/:id/receive` | POST | JWT | ARCHIVE_RECEIVE | — | `TransferPackageDto` |
| Accept package | `/api/transfer-packages/:id/accept` | POST | JWT | ARCHIVE_RECEIVE | — | `TransferPackageDto` |
| Reject package | `/api/transfer-packages/:id/reject` | POST | JWT | ARCHIVE_RECEIVE | `{ rejection_reason }` | `TransferPackageDto` |
| Archive package | `/api/transfer-packages/:id/archive` | POST | JWT | ARCHIVE_RECEIVE | — | `TransferPackageDto` |
| List packages | `/api/transfer-packages` | GET | JWT | — | Query: `record_id`, `status`, `submitter_id` | `TransferPackageDto[]` |
| Get package | `/api/transfer-packages/:id` | GET | JWT | — | — | `TransferPackageDto` |

### Transfer Package Status Lifecycle

```
DRAFT → SUBMITTED → RECEIVED_CHECKING → ACCEPTED → ARCHIVED
                                   ↘ REJECTED
```

### Rules

- Record must be `SEALED` before a Transfer Package can be created
- Submitter cannot receive or decide their own package (separation of duties)
- ADMIN is denied all Record and Transfer Package mutation operations
- ARCHIVE_SUBMIT and ARCHIVE_RECEIVE capabilities are required for respective operations
- All Transfer Package operations require TRANSFER permission check

## 16. Retention and Controlled Disposal

### Current Implementation Status

The backend exposes the following retention and disposal endpoints:

| Operation | Gateway Path | Method | Auth | Required Capability | Request | Response |
|---|---|---|---|---|---|---|
| Check eligibility | `/api/retention-disposal/check-eligibility` | POST | JWT | — | — | `{ eligible_count, eligible_ids }` |
| Approve disposal | `/api/retention-disposal/approve-disposal` | POST | JWT | DISPOSAL_APPROVE | `{ document_id, reason }` | approval |
| Execute disposal | `/api/retention-disposal/execute-disposal` | POST | JWT | DISPOSAL_APPROVE | `{ document_id }` | `{ status, objects_deleted }` |
| Place hold | `/api/retention-disposal/holds` | POST | JWT | — | `{ document_id, reason }` | `{ id, document_id, placed_at }` |
| Release hold | `/api/retention-disposal/holds/:id/release` | POST | JWT | — | — | `{ id, released_at }` |
| List holds | `/api/retention-disposal/holds` | GET | JWT | — | Query: `document_id`, `released` | holds list |
| List approvals | `/api/retention-disposal/approvals` | GET | JWT | — | Query: `document_id` | approvals list |

### Retention and Disposal Rules

- Retention expiry does not imply immediate deletion
- Active holds block Disposal
- Approval is required (requires `DISPOSAL_APPROVE` capability)
- ADMIN cannot approve or execute disposal
- Object deletion failure must not appear as success (status: `DISPOSAL_FAILED`)
- Audit evidence remains after Disposal

### Disposal Status Values

- `DISPOSED_ELIGIBLE` — document is eligible for disposal (set by check-eligibility)
- `DISPOSED` — disposal executed successfully
- `DISPOSAL_FAILED` — disposal execution failed

## 17. Public Endpoint Catalogue

All paths below are prefixed with the API Gateway base URL (default: `http://localhost:3000`).

### Authentication

| Method | Gateway Path | Auth | Request DTO | Response DTO | Important Errors | Owning Service | Web Usage | Flutter Usage |
|---|---|---|---|---|---|---|---|---|
| POST | `/api/auth/register` | No | `{ email, password, role? }` | `{ id, email, role }` | 400 | authentication-identity-service | Registration form | Registration screen |
| POST | `/api/auth/login` | No | `{ email, password }` | `{ access_token, refresh_token, expires_in_seconds }` | 401, 400 | authentication-identity-service | Login page | Login screen |
| POST | `/api/auth/refresh` | No | `{ refresh_token }` | `{ access_token, refresh_token, expires_in_seconds }` | 401, 400 | authentication-identity-service | Token refresh | Token refresh |
| POST | `/api/auth/logout` | No | `{ refresh_token }` | 204 | 400 | authentication-identity-service | Logout | Logout |

### Users

| Method | Gateway Path | Auth | Request DTO | Response DTO | Important Errors | Owning Service | Web Usage | Flutter Usage |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/users` | JWT | — | `UserDto[]` | — | user-role-management-service | Admin user list | — |
| GET | `/api/users/:id` | JWT | — | `UserDto` | 404 | user-role-management-service | Admin user detail | — |
| POST | `/api/users` | JWT | `{ id, email, role }` | `UserDto` | 400, 409 | user-role-management-service | Admin create user | — |
| POST | `/api/users/:id/lock` | JWT | — | `UserDto` | 404 | user-role-management-service | Admin lock user | — |
| POST | `/api/users/:id/unlock` | JWT | — | `UserDto` | 404 | user-role-management-service | Admin unlock user | — |
| POST | `/api/users/:id/capabilities` | JWT | `{ capability }` | `UserDto` | 400, 404 | user-role-management-service | Admin grant capability | — |
| DELETE | `/api/users/:id/capabilities/:capability` | JWT | — | `UserDto` | 404 | user-role-management-service | Admin revoke capability | — |

### Tasks

| Method | Gateway Path | Auth | Request DTO | Response DTO | Important Errors | Owning Service | Web Usage | Flutter Usage |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/tasks` | JWT | Query: `creator_id`, `assignee_id`, `status`, `parent_task_id` | `TaskDto[]` | 403 | task-management-service | Task list | Task list |
| GET | `/api/tasks/:id` | JWT | — | `TaskDto \| AncestorTaskSummaryDto` | 403, 404 | task-management-service | Task detail | Task detail |
| POST | `/api/tasks` | JWT | `{ title, description?, assignee_id?, parent_task_id?, deadline? }` | `TaskDto` | 400, 403 | task-management-service | Create task | — |
| POST | `/api/tasks/:id/status` | JWT | `{ status, reason? }` | `TaskDto` | 400, 403, 409 | task-management-service | Status transition | Status transition |
| POST | `/api/tasks/:id/assign` | JWT | `{ assignee_id }` | `TaskDto` | 400, 403 | task-management-service | Assign task | — |
| POST | `/api/tasks/:id/block` | JWT | `{ reason }` | `TaskDto` | 400, 403 | task-management-service | Block task | — |
| POST | `/api/tasks/:id/unblock` | JWT | — | `TaskDto` | 403 | task-management-service | Unblock task | — |
| POST | `/api/tasks/:id/participants` | JWT | `{ user_id, role? }` | participant | 400, 403 | task-management-service | Add participant | — |
| GET | `/api/tasks/:id/participants` | JWT | — | participant list | 403 | task-management-service | List participants | List participants |
| GET | `/api/tasks/:id/comments` | JWT | — | `TaskCommentDto[]` | 403 | task-management-service | Comment list | Comment list |
| POST | `/api/tasks/:id/comments` | JWT | `{ content }` | comment | 400, 403 | task-management-service | Add comment | Add comment |
| POST | `/api/tasks/:id/submit` | JWT | `{ content }` | submission | 400, 403 | task-management-service | Submit result | Submit result |
| POST | `/api/tasks/submissions/:submission_id/review` | JWT | `{ decision, comment? }` | review result | 400, 403 | task-management-service | Review submission | — |
| GET | `/api/tasks/:id/activity` | JWT | — | activity log | 403 | task-management-service | Activity log | Activity log |

### Documents

| Method | Gateway Path | Auth | Request DTO | Response DTO | Important Errors | Owning Service | Web Usage | Flutter Usage |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/documents` | JWT | Query: `owner_id`, `creator_id`, `status` | `DocumentDto[]` | — | document-management-service | Document list | Document list |
| POST | `/api/documents` | JWT | `{ title, document_type, owner_id, security_level?, retention_policy? }` | `DocumentDto` | 400 | document-management-service | Create document | — |
| GET | `/api/documents/:id` | JWT | — | `DocumentDto` | 403, 404 | document-management-service | Document detail | Document detail |
| GET | `/api/documents/:id/preview` | JWT | — | preview metadata | 403, 404 | document-management-service | Document preview | — |
| POST | `/api/documents/upload` | JWT | multipart/form-data | `{ document, version }` | 400, 401, 413, 415 | document-management-service | Upload document | Upload document |
| GET | `/api/documents/:id/versions` | JWT | — | `DocumentVersionDto[]` | — | document-management-service | Version list | Version list |
| GET | `/api/documents/:id/versions/:version` | JWT | — | `DocumentVersionDto` | 400, 404 | document-management-service | Version detail | — |
| POST | `/api/documents/:id/download-ticket` | JWT | `{ version, expires_in_seconds? }` | `DownloadTicketDto` | 403, 404 | document-management-service | Request download | Request download |
| POST | `/api/documents/:id/versions/:version/redeem` | JWT | `{ ticket_id }` | binary stream | 403, 404, 409 | document-management-service | Redeem download | Redeem download |

### Grants

| Method | Gateway Path | Auth | Request DTO | Response DTO | Important Errors | Owning Service | Web Usage | Flutter Usage |
|---|---|---|---|---|---|---|---|---|
| POST | `/api/permissions/grants` | JWT | `{ grantor_id, actor_id, resource_type, resource_id, permissions[], task_id, expires_at }` | `GrantDto` | 400 | permission-service | Create grant | — |
| GET | `/api/permissions/grants` | JWT | Query: `actor_id`, `resource_type`, `resource_id`, `status`, `task_id` | `GrantDto[]` | — | permission-service | List grants | List grants |
| GET | `/api/permissions/grants/:id` | JWT | — | `GrantDto` | 404 | permission-service | Grant detail | — |
| POST | `/api/permissions/grants/:id/delegate` | JWT | `{ actor_id, permissions? }` | `GrantDto` | 400, 404 | permission-service | Delegate grant | — |
| DELETE | `/api/permissions/grants/:id` | JWT | `{ reason? }` | `GrantDto` | 404 | permission-service | Revoke grant | — |

### Notifications

| Method | Gateway Path | Auth | Request DTO | Response DTO | Important Errors | Owning Service | Web Usage | Flutter Usage |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/notifications` | JWT | Query: `recipient_id` (required), `unread_only` | `NotificationDto[]` | 400 | notification-service | Notification list | Notification list |
| GET | `/api/notifications/:id` | JWT | — | `NotificationDto` | 404 | notification-service | Notification detail | — |
| POST | `/api/notifications/:id/read` | JWT | — | `NotificationDto` | 404 | notification-service | Mark read | Mark read |
| POST | `/api/notifications/read-all` | JWT | `{ recipient_id }` | `{ count }` | 400 | notification-service | Mark all read | Mark all read |
| GET | `/api/notifications/preferences/:userId` | JWT | — | `NotificationPreferenceDto` | — | notification-service | Preferences | Preferences |
| PUT | `/api/notifications/preferences/:userId` | JWT | `{ email_enabled?, in_app_enabled? }` | `NotificationPreferenceDto` | — | notification-service | Update prefs | Update prefs |

### Records

| Method | Gateway Path | Auth | Request DTO | Response DTO | Important Errors | Owning Service | Web Usage | Flutter Usage |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/records` | JWT | Query: `creator_id`, `status` | `RecordDto[]` | — | document-management-service | Record list | Record list |
| POST | `/api/records` | JWT | `{ title, description? }` | `RecordDto` | 400, 403 | document-management-service | Create record | — |
| GET | `/api/records/:id` | JWT | — | `RecordDto` | 404 | document-management-service | Record detail | — |
| POST | `/api/records/:id/entries` | JWT | `{ document_id, document_version_id }` | entry | 400, 404 | document-management-service | Add entry | — |
| POST | `/api/records/:id/seal` | JWT | — | `RecordDto` | 400, 403, 404 | document-management-service | Seal record | — |

### Transfer Packages

| Method | Gateway Path | Auth | Request DTO | Response DTO | Important Errors | Owning Service | Web Usage | Flutter Usage |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/transfer-packages` | JWT | Query: `record_id`, `status`, `submitter_id` | `TransferPackageDto[]` | — | document-management-service | Package list | Package list |
| GET | `/api/transfer-packages/:id` | JWT | — | `TransferPackageDto` | 404 | document-management-service | Package detail | — |
| POST | `/api/transfer-packages` | JWT | `{ record_id }` | `TransferPackageDto` | 400, 403 | document-management-service | Create package | — |
| POST | `/api/transfer-packages/:id/submit` | JWT | — | `TransferPackageDto` | 400, 403, 404 | document-management-service | Submit package | — |
| POST | `/api/transfer-packages/:id/receive` | JWT | — | `TransferPackageDto` | 400, 403, 404 | document-management-service | Receive package | — |
| POST | `/api/transfer-packages/:id/accept` | JWT | — | `TransferPackageDto` | 400, 403, 404 | document-management-service | Accept package | — |
| POST | `/api/transfer-packages/:id/reject` | JWT | `{ rejection_reason }` | `TransferPackageDto` | 400, 403, 404 | document-management-service | Reject package | — |
| POST | `/api/transfer-packages/:id/archive` | JWT | — | `TransferPackageDto` | 400, 403, 404 | document-management-service | Archive package | — |

### Security Alerts

| Method | Gateway Path | Auth | Request DTO | Response DTO | Important Errors | Owning Service | Web Usage | Flutter Usage |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/monitoring/alerts` | JWT | Query: `status`, `severity`, `actor_id`, `rule_id` | `SecurityAlertDto[]` | — | security-monitoring-service | Alert list | — |
| GET | `/api/monitoring/alerts/:id` | JWT | — | `SecurityAlertDto` | 404 | security-monitoring-service | Alert detail | — |
| POST | `/api/monitoring/alerts/:id/resolve` | JWT | `{ resolved_by }` | `SecurityAlertDto` | 400, 404 | security-monitoring-service | Resolve alert | — |

### Security Rules (Admin)

| Method | Gateway Path | Auth | Request DTO | Response DTO | Important Errors | Owning Service | Web Usage | Flutter Usage |
|---|---|---|---|---|---|---|---|---|
| POST | `/api/monitoring/rules` | JWT | `{ name, description?, rule_type, threshold?, window_minutes?, action? }` | `SecurityRuleDto` | 400 | security-monitoring-service | Create rule | — |
| GET | `/api/monitoring/rules` | JWT | — | `SecurityRuleDto[]` | — | security-monitoring-service | List rules | — |
| PUT | `/api/monitoring/rules/:id/toggle` | JWT | `{ enabled }` | `SecurityRuleDto` | 404 | security-monitoring-service | Toggle rule | — |

### Audit (Admin/Metadata)

| Method | Gateway Path | Auth | Request DTO | Response DTO | Important Errors | Owning Service | Web Usage | Flutter Usage |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/audit/events` | JWT | Query: `event_type`, `actor_id`, `resource_type`, `resource_id`, `limit`, `offset` | `AuditEventDto[]` | — | audit-log-service | Audit event list | — |
| GET | `/api/audit/events/:id` | JWT | — | `AuditEventDto` | 404 | audit-log-service | Audit event detail | — |
| GET | `/api/audit/chain/head` | JWT | — | chain head | — | audit-log-service | Chain status | — |
| POST | `/api/audit/chain/verify` | JWT | — | verification result | — | audit-log-service | Verify chain | — |

### Retention and Disposal

| Method | Gateway Path | Auth | Request DTO | Response DTO | Important Errors | Owning Service | Web Usage | Flutter Usage |
|---|---|---|---|---|---|---|---|---|
| POST | `/api/retention-disposal/check-eligibility` | JWT | — | `{ eligible_count, eligible_ids }` | — | document-management-service | Check eligibility | — |
| POST | `/api/retention-disposal/approve-disposal` | JWT | `{ document_id, reason }` | approval | 400, 403 | document-management-service | Approve disposal | — |
| POST | `/api/retention-disposal/execute-disposal` | JWT | `{ document_id }` | `{ status, objects_deleted }` | 400, 403 | document-management-service | Execute disposal | — |
| POST | `/api/retention-disposal/holds` | JWT | `{ document_id, reason }` | `{ id, document_id, placed_at }` | 400 | document-management-service | Place hold | — |
| POST | `/api/retention-disposal/holds/:id/release` | JWT | — | `{ id, released_at }` | 404 | document-management-service | Release hold | — |
| GET | `/api/retention-disposal/holds` | JWT | Query: `document_id`, `released` | holds list | — | document-management-service | List holds | — |
| GET | `/api/retention-disposal/approvals` | JWT | Query: `document_id` | approvals list | — | document-management-service | List approvals | — |

## 18. Internal Endpoints Forbidden to Clients

| Method | Internal Path | Owning Service | Purpose | Why Web/Flutter Must Not Call |
|---|---|---|---|---|
| POST | `/internal/permissions/check` | permission-service | Service-to-service permission check | Internal authorization decision |
| POST | `/auth/internal/sessions/revoke-all` | authentication-identity-service | Revoke all sessions for a user | Triggered by admin lock or security events |
| POST | `/security/uploads/process` | document-security-service | Process uploaded file through Security Pipeline | Internal scan/encrypt/sign pipeline |
| POST | `/security/process` | document-security-service | Process document version | Internal security pipeline |
| POST | `/security/:id/versions/:v/scan` | document-security-service | Update scan result | Internal scan callback |
| POST | `/security/:id/versions/:v/sign` | document-security-service | Sign document version | Internal signing |
| GET | `/security/:id/versions/:v/plaintext` | document-security-service | Stream plaintext bytes | Internal download mediation |
| POST | `/audit/events` | audit-log-service | Append audit event | Internal audit event recording |
| POST | `/monitoring/events` | security-monitoring-service | Record security event | Internal event recording |

## 19. Headers and Correlation IDs

### Required Headers

| Header | Purpose | When |
|---|---|---|
| `Authorization` | `Bearer <access_token>` | All authenticated requests |
| `Content-Type` | `application/json` or `multipart/form-data` | Request body |
| `x-correlation-id` | Correlation ID for tracing | Preserved from error responses |

### Internal Headers — Do Not Send

The API Gateway creates these headers from the validated JWT. The frontend must never
send them:

- `x-user-id` — set by Gateway from JWT `sub` claim
- `x-user-role` — set by Gateway from JWT `role` claim
- `x-user-capabilities` — set by Gateway from JWT `capabilities` claim

### Upload Headers (multipart)

- `Content-Type: multipart/form-data` with boundary
- File field name: `file`
- Metadata fields: `title`, `document_type`, `owner_id`, `security_level`, `retention_policy`, `declared_state_secret`

### Download Response Headers

- `Content-Type`: `application/octet-stream` or the document's actual MIME type
- `Content-Length`: file size in bytes
- `x-correlation-id`: for tracing

## 20. Error Handling

### Error Response Envelope

All errors follow the NestJS default format:

```json
{
  "statusCode": 403,
  "message": "Task access denied: NOT_A_PARTICIPANT",
  "error": "Forbidden"
}
```

### Status Code Reference

| Code | Meaning | Frontend Action |
|---|---|---|
| 400 | Validation error, bad request | Show field-level errors if available |
| 401 | Unauthenticated or expired token | Clear tokens, redirect to login |
| 403 | Permission or relationship denial | Show "access denied" — do not retry |
| 404 | Resource not found | Show "not found" message |
| 409 | Lifecycle conflict (invalid transition, duplicate) | Show conflict message |
| 413 | Upload size exceeded | Show file size limit |
| 415 | Unsupported MIME type | Show allowed types |
| 429 | Rate limit | Show retry-after if header present |
| 503 | Backend or dependency failure (mapped from 5xx) | Show "service unavailable", offer retry |

### Web Error Presentation

- Safe error page or message — no raw backend error
- Retain `x-correlation-id` for support/debugging
- No stack trace display
- No raw service error messages
- No internal service names, SQL errors, or infrastructure details

### Flutter Error Presentation

- Typed failure object
- Safe page, dialog, or snackbar
- Correlation ID preserved for debugging
- No raw backend exception display
- No sensitive device logging

## 21. Web UX Guidelines

This section is desktop-first, not mobile-first.

- **Desktop/laptop primary layout** — design for 1024px+ widths first
- **Tablet adaptation** — responsive breakpoints for 768px–1023px
- **Side navigation or top navigation** — appropriate for desktop workflows
- **Data-dense tables** — keep tables on large screens, do not convert to cards on desktop
- **Dashboard cards** — summary widgets for task and document overviews
- **Filters and search** — sidebar or top-bar filters for list views
- **Split layouts** — list-detail panes where useful on wide screens
- **Keyboard navigation** — all interactive elements must be keyboard-accessible
- **Mouse/trackpad support** — hover states, right-click context where appropriate
- **Accessible focus states** — visible focus indicators for keyboard users
- **Responsive behavior** — adapt layout on smaller browser widths but do not collapse to mobile-first
- **Mobile browser is secondary** — mobile browser support is not the official mobile app
- **Flutter is the official mobile interface** — do not describe mobile browser as the mobile product

## 22. Flutter Mobile UX Guidelines

- **Touch-first navigation** — designed for finger interaction
- **Bottom navigation or drawer** — appropriate for mobile navigation patterns
- **Android and iOS safe areas** — respect system UI insets
- **Compact cards** — use cards instead of desktop tables
- **Screen-specific states** — loading, empty, error, retry, and permission-denied for each screen
- **Pull-to-refresh** — only where safe and appropriate
- **Task and document list pagination** — load more on scroll
- **Upload/download progress** — visible progress indicators
- **App lifecycle handling** — background/foreground transitions
- **Keyboard and form handling** — keyboard appearance, form scrolling
- **Platform permission handling** — camera, storage, notification permissions
- **No offline mutation claim** — unless offline support is explicitly implemented

## 23. Suggested Web Routes

The following are frontend page route recommendations, not backend endpoint paths.
Apply role guards and content-access rules.

| Route | Purpose | Auth Required | Role Guard |
|---|---|---|---|
| `/login` | Login page | No | — |
| `/tasks` | Task list | Yes | Any authenticated user |
| `/tasks/:id` | Task detail | Yes | Direct participant or ancestor |
| `/documents` | Document list | Yes | Any authenticated user |
| `/documents/:id` | Document detail | Yes | Grant holder |
| `/notifications` | Notification list | Yes | Any authenticated user |
| `/records` | Record list | Yes | Any authenticated user |
| `/transfer-packages` | Transfer package list | Yes | Any authenticated user |
| `/security-alerts` | Security alert list | Yes | Any authenticated user |
| `/admin/users` | User administration | Yes | ADMIN only |
| `/admin/roles` | Role/capability management | Yes | ADMIN only |

## 24. Suggested Flutter Screens

The following are suggested UI screen names, not backend paths. Clearly marked as
suggested names for future implementation.

| Screen | Purpose |
|---|---|
| `LoginScreen` | Login and session |
| `TaskListScreen` | Assigned task list |
| `TaskDetailScreen` | Task detail, comments, activity |
| `DocumentListScreen` | Document metadata list |
| `DocumentDetailScreen` | Document detail and versions |
| `UploadDocumentScreen` | File upload |
| `NotificationListScreen` | Notification list |
| `RecordListScreen` | Record list |
| `TransferPackageListScreen` | Transfer package list |
| `ProfileScreen` | Account and session handling |

## 25. Shared Security Checklist

Both Web and Flutter must verify:

- [ ] API Gateway only — no internal endpoints
- [ ] No service ports (3001–3009)
- [ ] No direct storage connections (MinIO/S3/R2)
- [ ] No secrets in client code or configuration
- [ ] No `object_key` exposure in UI or logs
- [ ] No sensitive data in console/device logs
- [ ] Canonical task statuses from backend only
- [ ] Backend authorization is authoritative (frontend guards are UX only)
- [ ] Secure upload flow (multipart with metadata)
- [ ] Ticket-based download flow (request ticket, then redeem)
- [ ] Correlation IDs preserved in error reports
- [ ] ADMIN restrictions enforced (no content access)
- [ ] Grant expiry and revocation handled correctly
- [ ] 401 handling (clear tokens, redirect to login)
- [ ] 403 handling (clear "access denied" message)
- [ ] No trusted identity headers sent by client

## 26. Web Pull-Request Checklist

- [ ] TypeScript — no arbitrary `any`
- [ ] Typed DTOs matching backend contracts
- [ ] Centralized API client
- [ ] Desktop/laptop primary layout
- [ ] Tablet responsiveness
- [ ] Keyboard accessibility
- [ ] Safe Blob handling (create, revoke)
- [ ] Loading, empty, error, retry, and permission-denied states
- [ ] No service ports in code
- [ ] No internal routes in code
- [ ] No browser secret exposure
- [ ] Canonical task statuses from backend
- [ ] Correlation IDs in error reports
- [ ] No sensitive data in console logging

## 27. Flutter Pull-Request Checklist

- [ ] Dart null safety enforced
- [ ] Typed models (no raw `Map<String, dynamic>` in business logic)
- [ ] Centralized API client
- [ ] Secure token storage
- [ ] App lifecycle handling (background/foreground)
- [ ] Platform file picker and sandbox file handling
- [ ] Temporary-file cleanup after upload/download
- [ ] Android and iOS behavior verified
- [ ] Loading, empty, error, retry, and permission-denied states
- [ ] No service ports in code
- [ ] No internal routes in code
- [ ] No sensitive data in device logs
- [ ] Touch targets meet minimum size requirements
- [ ] Safe areas respected on both platforms

## 28. Known Limitations

Only limitations confirmed from the current implementation:

- **Web application not initialized** — Next.js architecture selected, no source code exists
- **Flutter Mobile application not initialized** — Flutter architecture selected, no source code exists
- **No WebSocket support** — all communication is HTTP request/response
- **No email delivery** — notification email adapter exists but no SMTP integration; EMAIL channel notifications are created as records but not delivered
- **No mobile push notifications** — no FCM or APNs integration
- **Cascade revoke gap** — the `cascadeRevoke` method exists but child grants are not queried recursively in the revoke path (known gap)
- **Upload IV and auth_tag are placeholders** in the `SecurityClient.processDocument` path — real encryption occurs in the `processUploadStream` path
- **No offline support** — no offline-first or background synchronization
- **Retention and Disposal endpoints exist** but are not automated — they require manual triggering
- **No app-store deployment** — no iOS or Android build configuration exists
