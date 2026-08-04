# Frontend–Backend Contract Conformance Design

## Goal

Make `frontend/web` conform to the current backend source of truth without changing
the existing UI/UX and without modifying backend source code unless conformance is
otherwise impossible.

## Scope and constraints

- Backend controllers, validation schemas, DTO mappers, route tables, guards, and
  canonical enums are authoritative.
- Frontend changes are limited to API clients, request/response types, endpoint
  paths, payloads, error/status handling, and contract tests.
- Existing JSX structure, CSS, labels, routes, navigation, visual styling, and
  interaction flow remain unchanged.
- No frontend request may target internal service ports, internal routes, or
  infrastructure services; browser traffic goes through the public Gateway.
- If a capability is not exposed by the current public Gateway, the frontend will
  not invent a route. The existing UI/UX will remain unchanged and the capability
  will be recorded as backend-blocked unless an existing client-side error path can
  represent that limitation without a UX redesign.
- The observed Prisma `P3005` startup message is an environment/database baseline
  issue. It is not a reason to alter frontend contracts or backend source during
  this work.

## Approach

1. Build and start the container stack before frontend edits.
2. Inventory the live Gateway route table and backend controller contracts.
3. Compare every frontend API module and type against those backend contracts.
4. For each mismatch, write a focused failing frontend contract test first.
5. Update only the frontend contract boundary until the test passes.
6. Run frontend lint, typecheck, unit tests, production build, and containerized
   web/Gateway smoke checks.

## Contract boundary

The audit covers:

- Authentication and refresh/logout payloads.
- Task filters, lifecycle transitions, ancestor summaries, comments, activity,
  participants, submissions, and reviews.
- Document upload metadata, versioning, preview, download tickets, and ticket
  redemption.
- Grants, notifications, administration, monitoring, records, transfer packages,
  retention/disposal, and any other frontend API module present in the source tree.
- Response field names, nullable fields, status literals, validation constraints,
  error status behavior, and URL encoding.

## Testing strategy

- Contract tests assert exact method, Gateway path, query/body field names, and
  response-facing type assumptions.
- Existing UI/component tests remain in place and are not redesigned.
- Tests use the current frontend transport boundary; no direct service-port calls
  or backend source changes are introduced to make tests pass.
- Runtime validation uses the containerized public Gateway and web container where
  the local environment permits it. Backend startup/database errors are reported
  separately from frontend conformance results.

## Success criteria

- Every reachable frontend API call matches a current backend Gateway route and
  controller contract.
- No frontend type claims fields or status values that the backend does not return
  or accept.
- No UI/UX files are changed unless a contract mismatch cannot be corrected at the
  API/type boundary; any such exception requires explicit review.
- Frontend lint, typecheck, unit tests, and production build pass.
- Containerized web and Gateway smoke checks pass, with backend runtime blockers
  clearly distinguished from frontend failures.

