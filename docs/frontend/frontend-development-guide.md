# Frontend Development and API Integration Guide

## 1. Purpose

This guide governs the responsive mobile-first web frontend for the C17 Task and Secure
Document Platform. It is the primary reference for any team implementing frontend features
that interact with the backend API.

## 2. Frontend Location and Application Type

- **Location:** `frontend/`
- **Application type:** Responsive mobile-first web application
- **Mobile browser** is the primary layout target
- **Desktop browser** is also supported
- Not a native Android or iOS application
- No separate mobile and desktop applications
- No direct infrastructure access from the frontend

## 3. Source-of-Truth Order

When documentation and runtime contracts disagree, the frontend must not guess.
The discrepancy must be reported.

1. Actual API contracts and controller implementation (the source code)
2. `CONTEXT.md` (domain vocabulary)
3. Accepted ADRs in `docs/adr/`
4. Backend implementation plan (`docs/planning/backend-implementation-plan.md`)
5. This frontend guide

## 4. Recommended Frontend Architecture

### Feature Modules

Organize code into feature-based modules:

- `auth` — login, registration, token management, session
- `users` — user profile, user administration (ADMIN only)
- `tasks` — task CRUD, lifecycle transitions, participants, comments, submissions, reviews
- `documents` — document upload, versions, metadata, download
- `permissions` — grant management, delegation, revocation
- `notifications` — notification list, read tracking, preferences
- `records` — record creation, sealing, entries
- `transfer-packages` — package creation, submission, reception, review
- `security-alerts` — security alert listing and resolution

### Core Principles

- **Centralized API client** — all HTTP calls go through one module; no scattered `fetch` calls
- **Centralized auth state** — token storage, refresh rotation, and logout in one place
- **Route guards** — frontend-only access control for UX (backend remains authoritative)
- **Shared typed DTOs** — generate or map TypeScript types from backend contracts
- **Shared error normalization** — handle all error responses in one place
- **No endpoint strings in components** — all API paths defined in the API client module
- **No business state strings duplicated** — canonical enums defined once
- **No direct fetch in view-only components** — data fetching belongs in service or store layer
- **Responsive reusable UI components** — mobile-first, enhance for larger screens

## 5. Environment Variables

Only public frontend configuration should appear in environment variables:

| Variable | Purpose | Example |
|---|---|---|
| `VITE_API_BASE_URL` | API Gateway base URL | `http://localhost:3000` |
| `VITE_APP_ENV` | Application environment | `development`, `staging`, `production` |

**Never put these in frontend environment variables:**

- Database credentials
- RabbitMQ credentials
- MinIO/S3/R2 secret keys
- ClamAV credentials
- KEKs (Key-Encrypting Keys)
- JWT signing secrets
- Internal service URLs (ports 3001–3009)

Use the naming convention appropriate to the chosen framework (e.g., `VITE_` for Vite,
`NEXT_PUBLIC_` for Next.js).

## 6. API Access Rules

These rules are mandatory and non-negotiable:

| Rule | Detail |
|---|---|
| Call the API Gateway only | All requests go to the Gateway base URL |
| Never call ports 3001–3009 | These are internal service ports |
| Never call `/internal/*` endpoints | These are for service-to-service communication |
| Never query service databases | PostgreSQL, Redis, RabbitMQ are backend-only |
| Never connect to MinIO/S3/R2 directly | Object storage is backend-only |
| Never use `object_key` | This is an internal storage identifier |
| Propagate correlation IDs | Include the `x-correlation-id` header from error responses |
| Use the actual auth header | `Authorization: Bearer <access_token>` |
| Do not fabricate headers | Never send `x-user-id`, `x-user-role`, or `x-user-capabilities` |

## 7. Authentication Flow

### Public Endpoints

| Operation | Gateway Path | Method | Request Body | Response |
|---|---|---|---|---|
| Register | `/api/auth/register` | POST | `{ email, password, role? }` | `{ id, email, role }` |
| Login | `/api/auth/login` | POST | `{ email, password }` | `{ access_token, refresh_token, expires_in_seconds }` |
| Refresh | `/api/auth/refresh` | POST | `{ refresh_token }` | `{ access_token, refresh_token, expires_in_seconds }` |
| Logout | `/api/auth/logout` | POST | `{ refresh_token }` | 204 No Content |

### Token Transport

- Access token: `Authorization: Bearer <token>` header
- Refresh token: returned in login/refresh response body, sent in request body for refresh/logout
- Token TTL: 30 minutes (1800 seconds) by default
- Refresh token TTL: 7 days

### Refresh Rotation

- On refresh, the old refresh token is revoked and a new pair is issued
- The frontend must store the new refresh token from each refresh response
- A locked user cannot log in or refresh — the backend rejects with 401

### 401 Handling

When the backend returns 401:

1. Clear stored tokens
2. Redirect to `/login`
3. Do not retry the failed request automatically

### Session Revocation

- Logout revokes the current refresh token
- Account locking revokes all active sessions for that user
- The frontend must handle 401 after token revocation gracefully

## 8. Role and Authorization Rules

### System Roles

| Role | Access |
|---|---|
| ADMIN | Platform administration only — users, roles, capabilities, lock/unlock, alerts, audit metadata |
| EMPLOYEE | Content participation — Tasks, Documents, Grants, Records, Transfer Packages |

### ADMIN Restrictions

ADMIN must never:

- Create, view, or participate in Tasks
- View or download Document content
- List or create Comments
- Hold or use any content-adjacent Grant
- Submit, receive, accept, or reject Transfer Packages
- Approve Disposal

### Direct Task Participants

A user has access to a Task's full detail (comments, submissions, reviews, activity) only if
they are one of:

- The task **Creator**
- The current task **Assignee**
- An explicitly assigned **Participant**

### What Does NOT Grant Access

- Mentions in Comments
- Subscriptions
- Notification recipients
- ADMIN role
- Capability-management authority

### Frontend Route Guards

Frontend route guards are for UX only. Backend authorization is authoritative.
Never hide a backend 403 by pretending the action succeeded.

## 9. Canonical Task Statuses

The backend uses exactly these lifecycle statuses:

| Status | Description |
|---|---|
| `CREATED` | Task has been created but not yet assigned |
| `ASSIGNED` | Task has been assigned to an Assignee |
| `IN_PROGRESS` | Work is underway |
| `WAITING_REVIEW` | Result has been submitted, awaiting review |
| `APPROVED` | Task is completed and accepted (terminal) |
| `NEED_REVISION` | Reviewer requested changes; returns to `IN_PROGRESS` |
| `REJECTED` | Task was rejected (terminal) |
| `CANCELLED` | Task was cancelled (terminal) |

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
- `OVERDUE` / `is_overdue` is derived on read: `deadline < now AND status NOT IN (APPROVED, REJECTED, CANCELLED)`
- Frontend must not invent additional status values
- Frontend must not submit arbitrary status strings
- UI actions must follow valid backend transitions

## 10. Task Confidentiality

### Who May View Task Detail

Only direct participants (Creator, Assignee, explicit Participant) may view full task
detail including Comments, submissions, and reviews.

### Ancestor Oversight

The Creator or current Assignee of an ancestor task may view a **summary** of descendant
tasks. The summary contains exactly these fields:

- `title`
- `status`
- `assignee`
- `deadline`
- `is_overdue`
- `completion result`

Ancestor oversight does not grant access to descendant Comments, Documents, or activity
beyond the summary fields.

### Comment Access

- Only direct task Participants may list or create Comments
- ADMIN is denied both operations unconditionally
- Comment content is confidential and must never appear in Audit events

### Child Task Rules

- The Assignee of a parent task becomes the Creator of the Child Task
- Every Child Task is required — a parent cannot be APPROVED until all children are APPROVED
- A Child Task's Creator reviews the Child Task

## 11. Document Upload Flow

### Upload Endpoint

**Multipart upload:**

```
POST /api/documents/upload
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

**Size limit:** Configured per deployment (check backend `MAX_UPLOAD_BYTES`).

**MIME allowlist:** Configured per deployment.

### Normal Security Levels

- `PUBLIC`
- `INTERNAL`
- `CONFIDENTIAL`
- `RESTRICTED`

### State-Secret Declarations

State-secret material (`MẬT`, `TỐI MẬT`, `TUYỆT MẬT`) is a separate policy value, not
a `SecurityLevel` enum member. Rules:

- Never place state-secret labels into the normal `SecurityLevel` enum
- UI must clearly prevent intentional upload of state-secret material
- Backend rejects the request before any Document is created
- Do not implement keyword-based or AI-based legal classification

### Response

```json
{
  "document": { "id": "...", "title": "...", "security_level": "...", ... },
  "version": { "version": 1, "checksum": "...", ... }
}
```

### Failure Status Codes

| Code | Meaning |
|---|---|
| 400 | Validation error, state-secret declared, or security processing failed |
| 401 | Authentication required |
| 413 | File size exceeded |
| 415 | Unsupported MIME type |

### Upload UX States

The frontend should manage these states:

1. **Validation** — client-side checks before request
2. **Uploading** — progress state
3. **Scanning/Processing** — backend security pipeline running
4. **Success** — document created
5. **Error** — safe error message (no internal details)

Rules:

- Do not display `object_key`
- Do not display internal ClamAV or cryptographic details
- Sanitize file names for display

## 12. Secure Download Flow

Downloads use a two-step ticket flow:

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
  "document_id": "...",
  "version": 1,
  "actor_id": "...",
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

### Error Handling

| Code | Meaning |
|---|---|
| 403 | Permission denied (Grant expired, revoked, or missing) |
| 404 | Document or ticket not found |
| 409 | Ticket already used or resource mismatch |
| 503 | Document security service unavailable |

## 13. Permission and Grant Rules

### Grant Endpoints (Frontend-Accessible)

| Operation | Gateway Path | Method |
|---|---|---|
| Create grant | `/api/permissions/grants` | POST |
| List grants | `/api/permissions/grants` | GET |
| Get grant | `/api/permissions/grants/:id` | GET |
| Delegate grant | `/api/permissions/grants/:id/delegate` | POST |
| Revoke grant | `/api/permissions/grants/:id` | DELETE |

### Internal Endpoints — Frontend Forbidden

| Endpoint | Reason |
|---|---|
| `POST /api/permissions/internal/permissions/check` | Internal service-to-service permission check |

### Grant Rules

- Every ordinary Grant requires a `task_id` — no access without a Task
- `effective_expires_at` is denormalized at Grant creation time (min of `expires_at`, task deadline, parent Grant's effective expiry)
- Delegated Grants cannot carry permissions the parent lacks
- Delegated Grants cannot outlive the parent's effective expiry
- Revocation cascades to all descendant Grants
- Expired and revoked Grants deny all access including VIEW
- Frontend displays backend decisions and must not calculate final authorization locally

## 14. Notifications

### Notification Endpoints

| Operation | Gateway Path | Method |
|---|---|---|
| List notifications | `/api/notifications?recipient_id=<userId>` | GET |
| Get notification | `/api/notifications/:id` | GET |
| Mark as read | `/api/notifications/:id/read` | POST |
| Mark all as read | `/api/notifications/read-all` | POST |
| Get preferences | `/api/notifications/preferences/:userId` | GET |
| Update preferences | `/api/notifications/preferences/:userId` | PUT |

### Notification Preferences

```json
{
  "email_enabled": true,
  "in_app_enabled": true
}
```

### Notes

- No real email delivery is implemented — only in-app notification records
- Notification events are not yet consumed from RabbitMQ — notifications must be created via the REST API

## 15. Records and Transfer Packages

### Record Endpoints

| Operation | Gateway Path | Method | Required Action |
|---|---|---|---|
| List records | `/api/records` | GET | — |
| Create record | `/api/records` | POST | — (ADMIN denied) |
| Get record | `/api/records/:id` | GET | — |
| Add entry | `/api/records/:id/entries` | POST | — (ADMIN denied) |
| Seal record | `/api/records/:id/seal` | POST | TRANSFER |

### Transfer Package Endpoints

| Operation | Gateway Path | Method | Required Capability |
|---|---|---|---|
| Create package | `/api/transfer-packages` | POST | ARCHIVE_SUBMIT + TRANSFER |
| Submit package | `/api/transfer-packages/:id/submit` | POST | ARCHIVE_SUBMIT + TRANSFER |
| Receive package | `/api/transfer-packages/:id/receive` | POST | ARCHIVE_RECEIVE + TRANSFER |
| Accept package | `/api/transfer-packages/:id/accept` | POST | ARCHIVE_RECEIVE + TRANSFER |
| Reject package | `/api/transfer-packages/:id/reject` | POST | ARCHIVE_RECEIVE + TRANSFER |
| Archive package | `/api/transfer-packages/:id/archive` | POST | ARCHIVE_RECEIVE + TRANSFER |
| List packages | `/api/transfer-packages` | GET | — |
| Get package | `/api/transfer-packages/:id` | GET | — |

### Transfer Package Status Lifecycle

```
DRAFT → SUBMITTED → RECEIVED_CHECKING → ACCEPTED → ARCHIVED
                                   ↘ REJECTED
```

### Rules

- Record must be `SEALED` before a Transfer Package can be created
- Submitter cannot receive or decide their own package (separation of duties)
- ADMIN is denied all Transfer Package operations
- ARCHIVE_SUBMIT and ARCHIVE_RECEIVE must not be held by the same account for the same package

## 16. Retention and Disposal

### Current Status

The `Document` model has `retention_policy` and `archive_status` fields, but automated
retention enforcement and controlled disposal workflows are not yet exposed through public
API endpoints.

**Not currently exposed by the backend:** Retention eligibility checks, retention hold
management, disposal approval endpoints, disposal execution endpoints.

### Rules (Backend-Enforced When Implemented)

- Expiry does not immediately delete content
- Active holds block Disposal
- Approval is mandatory (requires `DISPOSAL_APPROVE` capability)
- Object deletion failure must not be shown as successful Disposal
- Audit evidence remains after Disposal

## 17. API Endpoint Catalogue

### Public Frontend Endpoints

All paths below are prefixed with the API Gateway base URL (default: `http://localhost:3000`).

#### Authentication

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| POST | `/api/auth/register` | No | `{ email, password, role? }` | `{ id, email, role }` | 400 | auth-identity |
| POST | `/api/auth/login` | No | `{ email, password }` | `{ access_token, refresh_token, expires_in_seconds }` | 401, 400 | auth-identity |
| POST | `/api/auth/refresh` | No | `{ refresh_token }` | `{ access_token, refresh_token, expires_in_seconds }` | 401, 400 | auth-identity |
| POST | `/api/auth/logout` | No | `{ refresh_token }` | 204 | 400 | auth-identity |

#### Users / Profile

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| GET | `/api/users` | JWT | — | `UserDto[]` | — | user-role |
| GET | `/api/users/:id` | JWT | — | `UserDto` | 404 | user-role |
| POST | `/api/users` | JWT | `{ id, email, role }` | `UserDto` | 400 | user-role |
| POST | `/api/users/:id/lock` | JWT | — | `UserDto` | 404 | user-role |
| POST | `/api/users/:id/unlock` | JWT | — | `UserDto` | 404 | user-role |
| POST | `/api/users/:id/capabilities` | JWT | `{ capability }` | `UserDto` | 400, 404 | user-role |
| DELETE | `/api/users/:id/capabilities/:capability` | JWT | — | `UserDto` | 404 | user-role |

#### Tasks

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| GET | `/api/tasks` | JWT | Query: `creator_id`, `assignee_id`, `status`, `parent_task_id` | `TaskDto[]` | 403 | task-management |
| GET | `/api/tasks/:id` | JWT | — | `TaskDto` or `AncestorTaskSummaryDto` | 403, 404 | task-management |
| POST | `/api/tasks` | JWT | `{ title, description?, assignee_id?, parent_task_id?, deadline? }` | `TaskDto` | 400, 403 | task-management |
| POST | `/api/tasks/:id/status` | JWT | `{ status, reason? }` | `TaskDto` | 400, 403, 409 | task-management |
| POST | `/api/tasks/:id/assign` | JWT | `{ assignee_id }` | `TaskDto` | 400, 403 | task-management |
| POST | `/api/tasks/:id/block` | JWT | `{ reason }` | `TaskDto` | 400, 403 | task-management |
| POST | `/api/tasks/:id/unblock` | JWT | — | `TaskDto` | 403 | task-management |

#### Task Participants

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| POST | `/api/tasks/:id/participants` | JWT | `{ user_id, role? }` | participant | 400, 403 | task-management |
| GET | `/api/tasks/:id/participants` | JWT | — | participant list | 403 | task-management |

#### Comments

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| GET | `/api/tasks/:id/comments` | JWT | — | `TaskCommentDto[]` | 403 | task-management |
| POST | `/api/tasks/:id/comments` | JWT | `{ content }` | comment | 400, 403 | task-management |

#### Activity

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| GET | `/api/tasks/:id/activity` | JWT | — | activity log | 403 | task-management |

#### Submissions and Review

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| POST | `/api/tasks/:id/submit` | JWT | `{ content }` | submission | 400, 403 | task-management |
| POST | `/api/tasks/submissions/:id/review` | JWT | `{ decision, comment? }` | review result | 400, 403 | task-management |

#### Ancestor Oversight

Not currently exposed by the backend as a dedicated endpoint. Ancestor summary data is
returned by `GET /api/tasks/:id` when the requesting user is an ancestor Creator or
Assignee but not a direct participant.

#### Documents

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| GET | `/api/documents` | JWT | Query: `owner_id`, `creator_id`, `status` | `DocumentDto[]` | — | document-management |
| POST | `/api/documents` | JWT | `{ title, document_type, owner_id, security_level?, retention_policy? }` | `DocumentDto` | 400 | document-management |
| GET | `/api/documents/:id` | JWT | — | `DocumentDto` | 403, 404 | document-management |
| GET | `/api/documents/:id/preview` | JWT | — | preview metadata | 403, 404 | document-management |

#### Upload

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| POST | `/api/documents/upload` | JWT | multipart/form-data with `file` field | `{ document, version }` | 400, 401, 413, 415 | document-management |

#### Document Versions

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| GET | `/api/documents/:id/versions` | JWT | — | `DocumentVersionDto[]` | — | document-management |
| GET | `/api/documents/:id/versions/:version` | JWT | — | `DocumentVersionDto` | 400, 404 | document-management |

#### Download

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| POST | `/api/documents/:id/download-ticket` | JWT | `{ version, expires_in_seconds? }` | `DownloadTicketDto` | 403, 404 | document-management |
| POST | `/api/documents/:id/versions/:version/redeem` | JWT | `{ ticket_id }` | binary stream | 403, 404, 409 | document-management |

#### Grants

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| POST | `/api/permissions/grants` | JWT | `{ grantor_id, actor_id, resource_type, resource_id, permissions[], task_id, expires_at }` | `GrantDto` | 400 | permission |
| GET | `/api/permissions/grants` | JWT | Query: `actor_id`, `resource_type`, `resource_id`, `status`, `task_id` | `GrantDto[]` | — | permission |
| GET | `/api/permissions/grants/:id` | JWT | — | `GrantDto` | 404 | permission |
| POST | `/api/permissions/grants/:id/delegate` | JWT | `{ actor_id, permissions? }` | `GrantDto` | 400, 404 | permission |
| DELETE | `/api/permissions/grants/:id` | JWT | `{ reason? }` | `GrantDto` | 404 | permission |

#### Notifications

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| GET | `/api/notifications` | JWT | Query: `recipient_id`, `unread_only` | `NotificationDto[]` | 400 | notification |
| GET | `/api/notifications/:id` | JWT | — | `NotificationDto` | 404 | notification |
| POST | `/api/notifications/:id/read` | JWT | — | `NotificationDto` | 404 | notification |
| POST | `/api/notifications/read-all` | JWT | `{ recipient_id }` | `{ count }` | 400 | notification |
| GET | `/api/notifications/preferences/:userId` | JWT | — | `NotificationPreferenceDto` | — | notification |
| PUT | `/api/notifications/preferences/:userId` | JWT | `{ email_enabled?, in_app_enabled? }` | `NotificationPreferenceDto` | — | notification |

#### Records

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| GET | `/api/records` | JWT | Query: `creator_id`, `status` | `RecordDto[]` | — | document-management |
| POST | `/api/records` | JWT | `{ title, description? }` | `RecordDto` | 400 | document-management |
| GET | `/api/records/:id` | JWT | — | `RecordDto` | 404 | document-management |
| POST | `/api/records/:id/entries` | JWT | `{ document_id, document_version_id }` | entry | 400, 404 | document-management |
| POST | `/api/records/:id/seal` | JWT | — | `RecordDto` | 400, 403, 404 | document-management |

#### Transfer Packages

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| GET | `/api/transfer-packages` | JWT | Query: `record_id`, `status`, `submitter_id` | `TransferPackageDto[]` | — | document-management |
| GET | `/api/transfer-packages/:id` | JWT | — | `TransferPackageDto` | 404 | document-management |
| POST | `/api/transfer-packages` | JWT | `{ record_id }` | `TransferPackageDto` | 400, 403 | document-management |
| POST | `/api/transfer-packages/:id/submit` | JWT | — | `TransferPackageDto` | 400, 403, 404 | document-management |
| POST | `/api/transfer-packages/:id/receive` | JWT | — | `TransferPackageDto` | 400, 403, 404 | document-management |
| POST | `/api/transfer-packages/:id/accept` | JWT | — | `TransferPackageDto` | 400, 403, 404 | document-management |
| POST | `/api/transfer-packages/:id/reject` | JWT | `{ rejection_reason }` | `TransferPackageDto` | 400, 403, 404 | document-management |
| POST | `/api/transfer-packages/:id/archive` | JWT | — | `TransferPackageDto` | 400, 403, 404 | document-management |

#### Security Alerts

| Method | Gateway Path | Auth | Request | Response | Errors | Owning Service |
|---|---|---|---|---|---|---|
| GET | `/api/monitoring/alerts` | JWT | Query: `status`, `severity`, `actor_id`, `rule_id` | `SecurityAlertDto[]` | — | security-monitoring |
| GET | `/api/monitoring/alerts/:id` | JWT | — | `SecurityAlertDto` | 404 | security-monitoring |
| POST | `/api/monitoring/alerts/:id/resolve` | JWT | `{ resolved_by }` | `SecurityAlertDto` | 400, 404 | security-monitoring |

### Internal Service Endpoints — Frontend Forbidden

| Method | Internal Path | Owning Service | Reason Frontend Must Not Call |
|---|---|---|---|
| POST | `/internal/permissions/check` | permission-service | Service-to-service permission check |
| POST | `/auth/internal/sessions/revoke-all` | auth-identity-service | Internal session revocation |
| POST | `/security/uploads/process` | document-security-service | Internal security pipeline |
| POST | `/security/process` | document-security-service | Internal security pipeline |
| POST | `/security/:id/versions/:v/scan` | document-security-service | Internal scan result update |
| POST | `/security/:id/versions/:v/sign` | document-security-service | Internal signing |
| GET | `/security/:id/versions/:v/plaintext` | document-security-service | Internal plaintext stream |
| POST | `/audit/events` | audit-log-service | Internal audit event append |
| POST | `/monitoring/events` | security-monitoring-service | Internal security event recording |

## 18. Request Headers and Correlation

### Required Headers

| Header | Purpose | When |
|---|---|---|
| `Authorization` | `Bearer <access_token>` | All authenticated requests |
| `Content-Type` | `application/json` or `multipart/form-data` | Request body |
| `x-correlation-id` | Correlation ID for tracing | Preserved from error responses |

### Internal Headers — Do Not Send

The Gateway creates these headers from the validated JWT. The frontend must never send them:

- `x-user-id`
- `x-user-role`
- `x-user-capabilities`

## 19. Error Handling

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
| 409 | Lifecycle conflict (e.g., invalid transition) | Show conflict message |
| 413 | Upload size exceeded | Show file size limit |
| 415 | Unsupported MIME type | Show allowed types |
| 429 | Rate limit | Show retry-after if header present |
| 503 | Backend or dependency failure | Show "service unavailable", offer retry |

### Error Handling Rules

- Use safe user-facing messages
- Retain `x-correlation-id` for support/debugging
- Do not show stack traces
- Do not expose internal service names, SQL errors, MinIO paths, ClamAV internals, signatures, IVs, authentication tags, encrypted keys, or secrets
- Do not convert a backend denial into a generic success

## 20. Mobile-First UX Rules

- Design for narrow mobile width first; enhance progressively for tablet and desktop
- No separate mobile components unless behavior genuinely differs
- Support keyboard navigation
- Use accessible labels (ARIA)
- Provide sufficient touch targets (minimum 44x44px)
- Responsive tables should become cards, horizontal scroll, or summarized rows
- Long Task and Document names must wrap safely
- Upload and download progress must remain visible
- Destructive actions require explicit confirmation
- Permission-denied state must be clear and distinct from "not found"
- Loading, empty, error, retry, and offline states must be designed
- Offline mutation must not be claimed unless implemented

## 21. Frontend Coding Rules

- Use **TypeScript** — no arbitrary `any`
- Centralize all API calls in one module
- Centralize canonical enums (statuses, roles, permission actions)
- Generate or map DTO types from backend contracts where practical
- Do not duplicate authorization logic as a security boundary
- Do not hardcode service ports
- Do not hardcode role or status display logic across components
- Separate domain state from visual components
- Do not log tokens, document bytes, Comment content, or sensitive metadata
- Sanitize file names for display
- Revoke temporary browser object URLs after downloads/previews
- Do not store private Document content in persistent browser caches
- Do not expose backend error internals
- Preserve correlation IDs in client-side error reports
- Do not add dependencies without team review

## 22. Suggested Application Routes

The following is a frontend route recommendation, not backend endpoint paths.
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

## 23. Feature Completion Checklist

For every frontend pull request:

- [ ] Uses API Gateway only — no internal endpoint
- [ ] No hardcoded service port
- [ ] Handles mobile width correctly
- [ ] Handles loading, empty, error, and retry states
- [ ] Handles 401 (redirect to login)
- [ ] Handles 403 (clear "access denied" message)
- [ ] Handles 409 (conflict message)
- [ ] Does not expose `object_key`
- [ ] Does not store secrets in browser
- [ ] Uses canonical task statuses from the backend
- [ ] Respects ADMIN content prohibition
- [ ] Uses secure upload flow (multipart with metadata)
- [ ] Uses secure download flow (ticket + redeem)
- [ ] Includes correlation ID in error reports
- [ ] No sensitive data in console logging
- [ ] Endpoint paths verified against current backend controllers

## 24. Known Backend Limitations

Only limitations confirmed from the current implementation:

- **RabbitMQ consumers not implemented** — domain events are published but not consumed; notification creation is manual via REST API
- **Cascade revoke does not cascade to child Grants** in the current service code (the `cascadeRevoke` method exists but child grants are not queried recursively in the revoke path — this is a known gap)
- **Upload IV and auth_tag are placeholders** in the `SecurityClient.processDocument` path — real encryption occurs in the `processUploadStream` path
- **No automated retention/disposal worker** — retention_policy is stored but not enforced automatically
- **No WebSocket support** — all communication is HTTP request/response
- **No email delivery** — notification email adapter exists but no SMTP integration
