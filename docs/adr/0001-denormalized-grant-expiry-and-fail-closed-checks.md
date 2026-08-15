# Grants carry a denormalized expiry; permission checks fail closed

Permission Service must decide `effective_expires_at = min(grant.expires_at,
task.deadline, parent_grant.effective_expires_at)` at request time, but §7 of the
implementation plan forbids reading another service's database. Rather than call
task-management-service on every content request, we compute `effective_expires_at`
when the grant is created and store it on the grant row; task-management-service emits
deadline-change events which permission-service consumes to recompute affected grants.
A permission check therefore reads only `permission_db`.

Any failure of `/internal/permissions/check` — timeout, refused connection, or 5xx —
is a denial with `reason_code: PERMISSION_SERVICE_UNAVAILABLE`, audited like any other
denial. There is no allow-cache.

## Consequences

- Grants are eventually consistent with task deadlines. A shortened deadline narrows
  access only once the event is consumed. Acceptable because the window is small and
  errs toward the grant already being narrower than the task.
- Extending a task deadline does not widen or restore an existing grant, which is
  required behaviour under §5.5 rather than a side effect.
- Permission Service is a hard dependency for all document content access. Its
  availability is the platform's availability for content. This is deliberate: the
  system's thesis is that access is denied unless affirmatively proven.
- Rejecting an allow-cache costs latency on every content request, but any cache TTL
  would admit a revoked or expired grant for the length of that TTL, contradicting the
  rule that no permission survives its effective expiry.
