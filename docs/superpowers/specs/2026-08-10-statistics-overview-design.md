# Statistics Overview API Design

## Goal

Add an authenticated `GET /api/statistics/overview` endpoint that returns task,
document, activity, and security overview metrics for the current user, plus
organization-wide administrative metrics for `scope=ORGANIZATION`.

The implementation must use the repository's existing roles, permission
decisions, task statuses, database records, and service ownership boundaries.
It must not accept a user id from the query string, add a new business status,
or expose data outside the caller's authorization scope.

## Verified repository constraints

- The API Gateway validates the JWT and forwards the authenticated caller as
  `x-user-id`, `x-user-role`, `x-user-email`, and `x-user-capabilities`.
- The task service owns tasks, child tasks, task status history, and
  `TaskActivity`. Its current task statuses are:
  `CREATED`, `ASSIGNED`, `IN_PROGRESS`, `WAITING_REVIEW`, `APPROVED`,
  `NEED_REVISION`, `REJECTED`, and `CANCELLED`.
- Employee task listing is scoped by task participation and task permission
  checks. Activity reads require direct task participation.
- The document service owns documents and task-document associations. Its
  employee document inventory currently lists owned documents, while document
  reads are checked with the `PREVIEW` permission. Statistics must include all
  documents for which the caller has `PREVIEW`, including owner/creator and
  task/grant-derived access.
- The user-role service owns users and exposes `role`, `locked_at`, and
  `created_at` data.
- The monitoring service owns security alerts and already restricts alert reads
  to `ADMIN`.
- The audit service owns the hash chain and already exposes chain verification.
- There is no existing reliable monitoring-consumer readiness signal. The API
  must not fabricate one; the field is omitted unless a real existing health or
  consumer state can be checked.
- The Postman collections currently contain no statistics overview endpoint.

## API contract

### Request

```http
GET /api/statistics/overview?scope=ME&from=2026-08-01&to=2026-08-10
Authorization: Bearer <access-token>
```

Query validation:

- `scope` is required and must be `ME` or `ORGANIZATION`.
- `from` and `to` are required ISO calendar dates (`YYYY-MM-DD`).
- The range is inclusive and must satisfy `from <= to`.
- The range is limited to 90 calendar days.
- No `user_id` query parameter is accepted or used.

The authenticated caller is taken from the JWT established by the Gateway. An
`EMPLOYEE` calling `scope=ORGANIZATION` receives `403 Forbidden`. The
organization check is repeated by internal owning-service statistics handlers
as defense in depth.

### Response

The common response contains:

```json
{
  "scope": "ME",
  "range": { "from": "2026-08-01", "to": "2026-08-10" },
  "summary": {
    "total_tasks": 0,
    "in_progress_tasks": 0,
    "approved_tasks": 0,
    "overdue_tasks": 0,
    "visible_documents": 0,
    "task_documents": 0,
    "security_alerts": 0
  },
  "task_status": {
    "CREATED": 0,
    "ASSIGNED": 0,
    "IN_PROGRESS": 0,
    "WAITING_REVIEW": 0,
    "APPROVED": 0,
    "NEED_REVISION": 0,
    "REJECTED": 0,
    "CANCELLED": 0
  },
  "task_trend": [],
  "recent_activity": []
}
```

The response may contain these additional organization fields only when
`scope=ORGANIZATION`:

```json
{
  "users": {
    "total": 0,
    "active_employees": 0,
    "locked_users": 0
  },
  "organization_tasks": {
    "total": 0,
    "approved": 0,
    "overdue": 0
  },
  "security": {
    "open_alerts": 0,
    "audit_chain": "VALID"
  },
  "retention": {
    "eligible_documents": 0
  },
  "growth_trend": []
}
```

`security.monitoring_consumer` is optional and is included only if the current
repository provides a real readiness signal. It must not be hard-coded to
`READY`.

## Metric semantics

### Date range

The date range is interpreted as UTC calendar dates with an exclusive upper
timestamp of the day after `to`. Metrics use the owning record's existing
timestamp:

- Tasks and documents: `created_at`.
- Task-document associations: `attached_at`.
- Security alerts: `created_at`.
- Task activity and status transitions: their `created_at`.

`task_trend.created` counts tasks created on each date. `task_trend.completed`
counts existing task-status-history transitions to `APPROVED` on each date; it
does not infer completion from an unrelated update timestamp.

`overdue_tasks` reuses the task service's current overdue rule: a task is
overdue when it has a deadline before the current time and its status is not
`APPROVED`, `REJECTED`, or `CANCELLED`. The task must otherwise be visible and
within the requested created-at range.

`total_tasks` is the sum of the eight `task_status` buckets. Child tasks are
counted as separate tasks when they satisfy the same visibility and date
rules.

`task_documents` counts visible task-document associations attached during the
range. An association is visible to an employee only when both the task and
the document are accessible under the existing task/document permission
rules. Organization scope counts all associations without exposing document
content.

`visible_documents` counts distinct documents created during the range for
which the caller has the existing `PREVIEW` permission. This includes access
through ownership, creation, grants, and task context as already determined by
the permission service.

`recent_activity` returns at most 10 newest visible `TaskActivity` records. The
response maps the existing fields as follows:

| Response field | Existing source |
|---|---|
| `id` | `TaskActivity.id` |
| `type` | `TaskActivity.activity_type` |
| `message` | `TaskActivity.summary` |
| `created_at` | `TaskActivity.created_at` |

The activity list is not populated from notifications because the repository's
actual task activity source is `TaskActivity`.

For organization growth, each date contains cumulative users and tasks whose
existing `created_at` is on or before that date. Organization user counts use
the existing `role` and `locked_at` fields. Retention eligibility reuses the
document service's existing retention-expiry and active-hold rules and is a
current eligibility snapshot constrained to documents in the requested range.

## Architecture and data flow

The Gateway owns the public aggregation endpoint but does not read other
services' databases. A `StatisticsService` in the Gateway validates the query,
checks the caller's organization role, then calls read-only internal
statistics handlers owned by the relevant services in parallel.

The owning services keep all domain filtering and permission decisions close to
their data:

- Task management computes task/status/overdue/trend/activity metrics and
  filters employee results using the authenticated internal context.
- Document management computes visible-document and task-document metrics using
  existing `PREVIEW` and task-document authorization behavior, plus the
  organization retention snapshot.
- User-role management computes organization user totals and growth data.
- Security monitoring computes employee-owned alert counts and organization
  open-alert totals from its existing alert records.
- Audit log verification uses the existing hash-chain verification operation.

Internal handlers receive the caller context through the existing forwarded
headers and are not exposed through the public `/api/*` Gateway routes. The
public Gateway route forwards no caller-selected user id.

The Gateway combines the service results without changing their meaning. A
dependency timeout, malformed downstream response, or unavailable service
fails the overview request with `503`; it does not return a misleading partial
overview.

## Error handling

- Missing/invalid JWT: existing `401` Gateway behavior.
- Invalid scope/date/range: `400 Bad Request`.
- Employee requesting organization scope: `403 Forbidden`.
- Internal service authorization failure: `403 Forbidden`.
- Internal service timeout/unavailable or invalid aggregate response: `503
  Service Unavailable`.

## Testing strategy

Tests must cover behavior, not only mocks:

- Gateway/controller validation rejects invalid dates, reversed ranges, and
  ranges over 90 days.
- An employee receives a scoped `ME` response based on the JWT caller and no
  caller-supplied user id.
- An employee receives `403` for `scope=ORGANIZATION`.
- An admin receives organization metrics from all existing records.
- Employee results exclude tasks, activities, task-document associations, and
  documents outside task/document permission scope.
- All eight actual task statuses appear, including zero-count buckets.
- Child tasks are counted and `total_tasks` equals the status-bucket sum.
- Overdue counts follow the current terminal-status rule.
- Trend counts use task creation and `APPROVED` status-history timestamps.
- An unavailable downstream service produces `503` rather than partial data.
- Existing service authorization and integration suites remain green.

## Explicit non-goals

- No new task status such as `SUBMITTED`.
- No user impersonation or `user_id` query support.
- No new statistics database or materialized counter tables.
- No exposure of document content, task content, or audit payloads through the
  overview endpoint.
- No fabricated monitoring-consumer readiness value.
- No frontend dashboard implementation in this backend endpoint change.
