# Paginated List API Contract Design

## Goal

Standardize pagination for every public list endpoint in the task/document platform so large
datasets are bounded at the database query, while clients receive enough metadata to render page
controls and navigate safely.

## Approved contract

Every paginated list endpoint accepts:

```text
page=1&page_size=20
```

`page` is one-based. `page_size` defaults to `20` and is capped at `100`. Invalid values return
`400 Bad Request`; values are not silently clamped. A request for a page beyond the last page is
valid and returns an empty `items` array with the actual pagination metadata.

Every list endpoint returns:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 0,
    "total_pages": 0,
    "has_next": false,
    "has_previous": false
  }
}
```

`total_pages` is `ceil(total / page_size)` and is `0` when there are no matching rows. `has_next`
and `has_previous` are derived from the requested page and `total_pages`.

## Scope

Paginate these list operations and preserve their existing authorization and filters:

- Users: users and employee directory.
- Tasks: tasks, participants, comments, activity, and task-accessible documents.
- Documents: documents, versions, records, transfer packages, retention holds, and disposal
  approvals.
- Permissions: grants.
- Notifications: recipient notifications.
- Audit: audit events. Existing `limit`/`offset` callers migrate to `page`/`page_size`.
- Security monitoring: alerts and rules.
- Document security: encryption records.

Do not paginate single-resource endpoints, binary download/preview endpoints, chain-head or health
endpoints, or internal outbox polling. Outbox `take` remains an internal processing batch and is not
an API pagination contract.

## Architecture

Add a shared pagination contract/helper in `@c17/contracts` containing the query schema, response
types, and metadata calculation. Services receive a typed pagination value rather than raw query
strings. Controllers validate query parameters and return the shared response shape.

Each database-backed list query performs a filtered `count` and a bounded `findMany` using:

```typescript
skip: (page - 1) * page_size,
take: page_size,
```

Queries must retain a deterministic `orderBy`; endpoints without an existing order use a stable
created-time or identifier order. Count and page reads may run together with `Promise.all` where
there is no transaction requirement.

The API gateway forwards the query string unchanged. Frontend API types and list callers migrate to
`items` plus `pagination`; reusable page controls are added only to screens that render paginated
lists. Postman examples use `page` and `page_size` and display the response metadata.

## Compatibility and authorization

This is an intentional response-contract migration from bare arrays to `{ items, pagination }`.
All backend, frontend, contract tests, and Postman examples must be updated in the same change.
Existing filters and authorization behavior remain unchanged; pagination must be applied after the
authorized filter is constructed so `total` never reveals rows the caller cannot access.

## Testing strategy

1. Add failing contract tests for default values, maximum size, invalid values, empty results,
   first-page metadata, middle-page offsets, and beyond-last-page behavior.
2. Add service tests for `count`, `skip`, `take`, deterministic ordering, and preservation of
   existing filters/auth scope.
3. Add controller/API tests for the new response envelope and validation errors for representative
   endpoints in each service family.
4. Update frontend contract/type tests and verify page navigation uses the returned metadata.
5. Run the full backend test suite, frontend tests, backend lint/build, and live smoke checks for
   at least documents, tasks, grants, notifications, audit events, and security alerts.

## Acceptance criteria

- No public list endpoint in scope returns an unbounded database result.
- All in-scope endpoints accept the shared pagination query and return the shared envelope.
- `total` and page metadata reflect the caller's authorized filtered dataset.
- Existing authorization regression tests remain green.
- Backend and frontend consumers no longer assume list responses are bare arrays.
- Full verification passes without relying on a single happy-path endpoint.
