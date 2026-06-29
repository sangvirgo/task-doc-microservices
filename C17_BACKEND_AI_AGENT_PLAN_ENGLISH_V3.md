# C17 BACKEND IMPLEMENTATION PLAN FOR AI CODING AGENTS — V3

> **Project:** Task Assignment and Secure Digital Document Sharing Platform for Organizations  
> **Team:** C17  
> **Primary Backend Implementer:** N22DCCN068 — Nguyen Luu Tan Sang  
> **Implementation Style:** Full backend implementation by Sang; progress tracked by end-to-end test cases  
> **Architecture:** NestJS monorepo managed by pnpm, PostgreSQL, Redis, RabbitMQ, MinIO, ClamAV, Docker Compose  
> **Planned / retrospective phase windows:** July 1, 2026 to August 4, 2026  
> **Branch Policy:** Exactly one working branch per phase  
> **Commit Policy:** Exactly three meaningful local commits per phase  
> **Push Policy:** The AI agent must never push code unless the user explicitly authorizes that push  
> **Merge Policy:** The AI agent must never merge into `main` unless the user explicitly authorizes that merge

**Supersedes:** `C17_BACKEND_AI_AGENT_PLAN_ENGLISH_V2.md`

---

# 0. AUTHORITATIVE COMPANION DOCUMENTS

The following documents are authoritative and must be read alongside this plan. Where
this plan and these documents disagree, these documents win.

```text
CONTEXT.md                                                  domain vocabulary
docs/adr/0001-denormalized-grant-expiry-and-fail-closed-checks.md
docs/adr/0002-single-writer-audit-chain.md
docs/adr/0003-versioned-kek-from-the-start.md
docs/adr/0004-participation-gated-confidentiality.md
```

`CONTEXT.md` defines the project's ubiquitous language. Use its canonical terms in code,
API contracts, event names, commit messages, and reports. Do not introduce a synonym that
`CONTEXT.md` lists under `_Avoid_`.

The ADRs record architectural decisions that are hard to reverse. The agent must not
silently deviate from a recorded ADR. If implementation reveals that an ADR is wrong,
stop and report it; do not work around it.

---

# 1. PRIMARY AGENT RULES

The AI coding agent must follow these rules before reading any implementation detail.

## 1.1 One branch per phase

Use exactly these four phase branches:

```text
phase/01-foundation-auth-permission
phase/02-task-document-timed-grants
phase/03-expiry-review-audit-monitoring
phase/04-archive-release-evidence
```

Do not create a separate branch for each commit, feature, test case, service, or Pull Request.

Each phase branch contains exactly three meaningful local commits.

## 1.2 No automatic push

The agent may:

- create the phase branch locally;
- edit files;
- run migrations;
- run tests;
- create local commits;
- produce a stop-point report.

The agent must not execute any of the following without explicit permission:

```bash
git push
git push -u origin <branch>
git push --tags
gh pr create
gh pr merge
git merge
git rebase main
git checkout main
git tag
```

The agent must not infer permission from:

- the existence of a remote;
- the fact that tests pass;
- a previously approved phase;
- general instructions such as "continue";
- access to GitHub credentials.

A push is permitted only after the user sends an explicit instruction similar to:

```text
APPROVE PUSH PHASE 1
```

A Pull Request is permitted only after the user sends an explicit instruction similar to:

```text
APPROVE PR PHASE 1
```

A merge is permitted only after the user sends an explicit instruction similar to:

```text
APPROVE MERGE PHASE 1
```

The next phase may begin only after the user sends:

```text
START PHASE 2
```

Permission applies only to the named phase and action.

For example:

```text
APPROVE PUSH PHASE 1
```

does not authorize:

- creating a Pull Request;
- merging the Pull Request;
- starting Phase 2;
- pushing tags.

## 1.3 Mandatory stop points

The agent must stop:

1. after completing the local commits of each phase;
2. after pushing a phase branch;
3. after creating a Pull Request;
4. after fixing review comments;
5. before merging into `main`;
6. after merging and before creating the next phase branch.

At every stop point, the agent must send a report and wait for the user.

## 1.4 No automatic merge

The agent must never merge directly into `main`.

The expected flow is:

```text
Create phase branch locally
-> implement phase
-> run checks
-> create three local commits
-> STOP and report
-> user approves push          (APPROVE PUSH PHASE X)
-> push phase branch
-> STOP and report
-> user approves Pull Request  (APPROVE PR PHASE X)
-> create Pull Request
-> STOP and report
-> user reviews
-> user approves merge         (APPROVE MERGE PHASE X)
-> squash merge into main
-> STOP and report
-> user approves next phase    (START PHASE X+1)
```

## 1.5 Git history must remain factual

The July 1 – August 4, 2026 range in this document is a **planned / retrospective phase
window**. It is reporting and planning metadata. It is not an implementation deadline and
it does not describe when work actually happened.

The agent must preserve actual Git authorship and actual commit timestamps.

The agent must never alter, backdate, or rewrite real Git timestamps, and must never
adjust author or committer dates to make actual work appear to fall inside a planned
window.

Every evidence report and every weekly report must record both:

```text
Planned phase window
Actual implementation date
```

Where the two differ, record the difference plainly as schedule variance. Divergence
between the planned window and the actual date is expected and is not a defect.

Do not fabricate historical work, authorship, tests, Pull Requests, or evidence.

---

# 2. SOURCE OF TRUTH

Implementation priority:

1. Supervisor requirements.
2. The approved C17 Business Design.
3. `CONTEXT.md` and the accepted ADRs in `docs/adr/`.
4. This implementation plan.
5. Technical decisions made during coding.

The agent must not silently change a business rule because another design seems easier.

---

# 3. REQUIRED BACKEND SERVERS

The repository must contain all ten required NestJS servers, each independently runnable:

```text
apps/
  api-gateway/
  authentication-identity-service/
  user-role-management-service/
  task-management-service/
  document-management-service/
  document-security-service/
  permission-service/
  audit-log-service/
  notification-service/
  security-monitoring-service/
```

Additional modules:

```text
Task Collaboration       -> task-management-service
Records/Archive/Transfer -> document-management-service
Performance/Scoring      -> optional only after core release
```

Do not combine the ten required servers into fewer deployable applications.

---

# 4. REQUIRED TECHNOLOGY STACK

Use stable supported versions and pin exact versions in the lockfile.

```text
Runtime:         Node.js 24 LTS
Framework:       NestJS 11.x
Language:        TypeScript strict mode
Repository mode: NestJS monorepo managed by pnpm
Package manager: pnpm
HTTP adapter:    Express
ORM:             Prisma
Database:        PostgreSQL
Cache/session:   Redis
Message broker:  RabbitMQ
Object storage:  MinIO
Malware scan:    ClamAV
API docs:        Swagger/OpenAPI
Tests:           Jest + Supertest
Deployment:      Docker Compose
```

## 4.1 Repository mode is NestJS monorepo, not a pnpm workspace

V2 named a "pnpm workspace" in the stack but drew a NestJS monorepo in the repository
tree. These are incompatible layouts. V3 resolves this in favour of **NestJS monorepo
mode**, with **pnpm as the package manager**:

- one root `package.json`;
- one root `pnpm-lock.yaml`;
- one `nest-cli.json` declaring ten applications and the shared libraries;
- `libs/` are Nest libraries consumed through TypeScript path aliases;
- **no** per-application `package.json`;
- **no** `pnpm-workspace.yaml`;
- **no** `workspace:*` dependencies.

Each application must remain independently runnable and independently deployable as a
container. Monorepo mode is a build-time arrangement; it must not become a runtime
coupling.

Do not perform a major framework upgrade during an active phase.

---

# 5. NON-NEGOTIABLE BUSINESS RULES

## 5.1 Authentication and sessions

- Access token lifetime: 15 to 30 minutes.
- Refresh tokens are revocable.
- A locked user cannot log in or refresh.
- Locking a user revokes active refresh sessions.
- API Gateway is the public entry point.
- Do not log passwords, tokens, private keys, or raw document content.

## 5.2 Roles and administrator restriction

System roles:

```text
ADMIN
EMPLOYEE
```

ADMIN holds authority over the platform and never over content.

ADMIN may manage:

- users;
- roles;
- capabilities;
- lock/unlock;
- policies;
- alerts;
- audit metadata.

### 5.2.1 ADMIN forbidden actions

ADMIN must never hold or perform any of the following:

```text
task participation
comment access (list or create)
document preview
document download
document update
document sharing
document transfer
archive submission
archive reception
archive acceptance or rejection
disposal approval
DISPOSE permission
```

This list is exhaustive of what is currently known, not of what is possible. Any new
right that touches content, task participation, or archive custody must be tested against
the rule in ADR-0004 before it is added.

ADMIN may only assign eligible capabilities to EMPLOYEE accounts. An ADMIN account can
never hold a content-adjacent capability itself, because ADMIN is the role that grants
capabilities — see §5.2.2 and ADR-0004.

This must be enforced by Permission Service and by every document-content, task-comment,
and archive endpoint. It must not be enforced only at the Gateway.

### 5.2.2 Capabilities

A capability is a fine-grained right held by an EMPLOYEE and administered by an ADMIN,
used where the two system roles are too coarse.

```text
ARCHIVE_SUBMIT     may submit a Transfer Package
ARCHIVE_RECEIVE    may receive, accept, or reject a Transfer Package (the Archivist)
DISPOSAL_APPROVE   may approve a controlled disposal
```

Rules:

- capabilities are held only by EMPLOYEE accounts;
- an ADMIN account can never hold a content-adjacent capability;
- granting a capability is audited;
- a capability never substitutes for a Grant on a specific Document.

### 5.2.3 Separation of duties for archive transfer

The EMPLOYEE who submits a Transfer Package must not be the Archivist who accepts or
rejects it. `ARCHIVE_SUBMIT` and `ARCHIVE_RECEIVE` must not be held by the same account
for the same package.

## 5.3 Task lifecycle

Stored lifecycle status:

```text
CREATED
-> ASSIGNED
-> IN_PROGRESS
-> WAITING_REVIEW
-> APPROVED
-> NEED_REVISION -> IN_PROGRESS
-> REJECTED
```

Additional rules:

- The creator may cancel according to policy.
- An assignee may create a child task.
- The parent assignee becomes the child-task creator.
- The child-task creator reviews the child task.
- **Every child task is required.** A parent task cannot become APPROVED until all of its
  child tasks are APPROVED. There is no optional child task and no `is_required` field.

### 5.3.1 OVERDUE is derived, BLOCKED is stored

`OVERDUE` is **not** a stored status and **not** a transition. It is a derived condition
computed on read:

```text
is_overdue = deadline < now AND status NOT IN (APPROVED, REJECTED, CANCELLED)
```

No worker writes it. No row stores it. Nothing transitions into it.

`BLOCKED` **is** stored state, because a person enters it deliberately. A blocked task
records:

```text
blocked            boolean
blocked_reason     text
previous_status    the lifecycle status to return to on unblock
```

`blocked` is orthogonal to the lifecycle status enum, not a member of it.

## 5.4 Document lifecycle

```text
UPLOADED
-> VALIDATED
-> ENCRYPTED
-> SIGNED/VERIFIED
-> CLASSIFIED
-> ATTACHED_TO_RECORD/TASK
-> SHARED
-> ARCHIVED/TRANSFERRED
-> DISPOSED
```

`SHARED` means "made accessible through a task-derived Grant". It does not describe a
separate sharing feature. See §5.5.1.

Required metadata:

```text
document_id
title
document_type
owner_id
creator_id
security_level
checksum
version
signature_status
retention_policy
archive_status
record_id
object_key
```

Internal security levels:

```text
PUBLIC
INTERNAL
CONFIDENTIAL
RESTRICTED
```

### 5.4.1 State-secret material is rejected before a Document exists

The demo must reject documents declared to be state-secret material.

There is deliberately **no** `STATE_SECRET` value in the security level enum. State-secret
material must never become a Document, so no Document ever carries that classification.

The rejection happens at upload, before any Document row is created and before the
Security Pipeline runs:

- the upload request carries a declaration;
- if the material is declared state-secret, the request is rejected;
- no Document row is created;
- no object is written to MinIO;
- the rejection is audited as a denial.

## 5.5 Timed permission grants

Permission set:

```text
VIEW
DOWNLOAD
UPDATE
SHARE
TRANSFER
ARCHIVE
DISPOSE
```

Required grant fields:

```text
grantor_id
grantee_id
document_id
source_task_id
permissions[]
expires_at
effective_expires_at
parent_grant_id
status
revoked_at
revocation_reason
```

### 5.5.1 Every ordinary document grant requires a task

`source_task_id` is mandatory and non-nullable on every ordinary document Grant. There is
no way to hold document access without a Grant, and no Grant without a task.

A document owner cannot share a document outside of a task. This is what makes the rule
"no access outlives the work that justified it" true without exception, and it is the
project's core thesis.

Effective expiration:

```text
effective_expires_at = min(
  grant.expires_at,
  task.deadline,
  parent_grant.effective_expires_at
)
```

### 5.5.2 effective_expires_at is denormalized onto the grant — ADR-0001

`effective_expires_at` is computed when the Grant is created and stored on the Grant row.
Permission Service must never query `task_db`.

`task-management-service` emits a deadline-change event; `permission-service` consumes it
and recomputes `effective_expires_at` for affected Grants. A permission check therefore
reads only `permission_db`.

Consequence: Grants are eventually consistent with task deadlines. This is accepted, and
it errs toward the Grant already being narrower than the task.

Delegation:

```text
child.permissions ⊆ parent.permissions
child.effective_expires_at <= parent.effective_expires_at
```

When effective expiration is reached, revoke every permission:

```text
VIEW
DOWNLOAD
UPDATE
SHARE
TRANSFER
ARCHIVE
DISPOSE
```

No VIEW permission remains after the deadline.

Permission Service must deny at request time even if the scheduled worker has not updated
the database.

Parent expiration or revocation invalidates every descendant grant.

Extending a task deadline must not automatically restore an expired grant. Because
`effective_expires_at` is fixed at creation, this falls out of the design rather than
requiring a special rule.

### 5.5.3 Permission checks fail closed with no allow-cache — ADR-0001

Every failure of `/internal/permissions/check` is a denial:

- timeout;
- connection refused;
- 5xx response.

Such a failure produces:

```json
{
  "allowed": false,
  "reason_code": "PERMISSION_SERVICE_UNAVAILABLE"
}
```

The denial is audited like any other denial. The client-facing response must not leak
internal failure detail beyond a generic denial.

There is **no allow-cache**. Any cache TTL would admit a revoked or expired Grant for the
length of that TTL, contradicting the rule that no permission survives its effective
expiry.

Permission Service is therefore a hard dependency for all document content access. Its
availability is the platform's availability for content. This is deliberate.

## 5.6 Document security

- AES-256-GCM.
- One DEK per document version.
- Envelope encryption.
- SHA-256 checksum.
- RSA/ECDSA with SHA-256 for the demo signature.
- Ciphertext stored in MinIO.
- Raw file not stored in PostgreSQL.
- Short-lived secure preview/download ticket.
- Storage object key not exposed to clients.

### 5.6.1 Versioned KEKs from day one — ADR-0003

The key-encrypting key is loaded from an environment secret or Docker secret at boot and
is never committed to the repository.

Required scope — implement exactly this:

- every wrapped DEK stores the `kek_version` of the KEK that wrapped it;
- unwrap selects the correct KEK version from `kek_version`;
- new document versions are wrapped with the **active** KEK version;
- the KEK provider is an interface, so a future rotation implementation can replace it
  without touching call sites.

Explicitly **out of scope** for this project — do not build:

- a production KMS or external key service;
- an automatic rotation scheduler;
- a bulk re-wrap migration.

The platform can therefore read documents wrapped under any recorded KEK version but
cannot re-wrap them. This is a deliberate, accepted boundary rather than an unfinished
feature, and it is recorded in Known Limitations.

The versioning exists because retrofitting it is not a code change but a data migration
over every encrypted document in storage.

### 5.6.2 Upload pipeline and the service handoff

The Security Pipeline is the one-way path every uploaded file takes before it becomes a
Document:

```text
scan -> checksum -> encrypt -> sign -> store
```

A file that fails any stage never becomes a Document.

The handoff between services is an **HTTP streaming handoff**:

1. Gateway streams the upload to `document-management-service`.
2. `document-management-service` writes the bytes to a temporary location.
3. `document-management-service` streams them over HTTP to `document-security-service`.
4. `document-security-service` scans (ClamAV), hashes (SHA-256), encrypts (AES-256-GCM),
   signs, and stores the ciphertext in MinIO.
5. `document-security-service` returns `checksum`, `object_key`, `signature`, and
   `kek_version`.

Rules:

- the two services must **not** share a filesystem volume for this handoff;
- plaintext temporary files must be deleted in a `finally` block, so that cleanup runs on
  the failure and exception paths as well as the success path;
- raw bytes must never be logged, and must never reach `audit-log-service`;
- `object_key` is never returned to a client.

## 5.7 Audit

Audit is append-only at the application layer and tamper-evident:

```text
current_hash = SHA-256(canonical_event_payload + previous_hash)
```

Audit both allow and deny results for:

- authentication;
- document access;
- permission grant/revoke/expire;
- task submit/review;
- task comment list and create;
- capability grant;
- record closure;
- archive transfer;
- package acceptance/rejection;
- controlled disposal.

### 5.7.1 The audit chain has exactly one writer — ADR-0002

A hash chain is only correct if appends are strictly serialized. A concurrent consumer
would read the same `previous_hash` twice and fork the chain silently, with verification
failing only much later.

Therefore:

- `audit-log-service` consumes with `prefetch=1`;
- `audit-log-service` runs at a **single replica**;
- every append runs in one transaction that takes a lock on the chain-head row
  (`SELECT ... FOR UPDATE` or a Postgres advisory lock).

### 5.7.2 Idempotency lives inside the locked append transaction — ADR-0002

There is a unique index on `event_id`. Within the **same transaction** that holds the
chain-head lock, the consumer checks for an existing `event_id` and no-ops if present.

The dedupe check must never be moved out of the append transaction. A Redis or
application-level dedupe would let a crash between dedupe and append drop or double an
event, and the chain would quietly stop meaning anything.

### 5.7.3 Audit is evidence, not a query surface

`AuditEvent` in `audit_db` is an independent evidence record. It is not a read model for
any user-facing feature. See §5.10.

## 5.8 Security monitoring

Minimum rules:

- repeated failed login;
- repeated denied content access;
- abnormal download volume;
- abnormal sharing;
- access after grant expiration;
- invalid checksum/signature;
- repeated archive-package rejection.

Security Monitoring is rule-based unless a real model exists.

## 5.9 Archive lifecycle

```text
DRAFT
-> SEALED
-> SUBMITTED
-> RECEIVED_CHECKING
-> ACCEPTED | REJECTED
-> ARCHIVED
-> DISPOSED_ELIGIBLE
-> DISPOSED
```

Package contents:

- files;
- `manifest.json`;
- `metadata.json`;
- checksums;
- signature/verification data;
- audit references;
- electronic handover receipt.

Archive actors are EMPLOYEE capabilities, never system roles — see §5.2.2. The Archivist
is an EMPLOYEE holding `ARCHIVE_RECEIVE`.

Retention expiration must not delete a document immediately. Disposal removes content,
never evidence: the Audit Trail survives disposal.

## 5.10 Task participation, comments, and progress

### 5.10.1 Authorized task participants — ADR-0004

Access is deny-by-default. Authorization is per-task: it is held on one specific task and
does not propagate along the task hierarchy except as narrowly defined in §5.10.2.

**Direct participants** of a task are exactly:

- the task creator;
- the current task assignee;
- explicitly assigned task participants.

A direct participant may read the full detail of that task: comments, result submissions,
review decisions, and `TaskActivity`.

The following **do not** grant task or comment access by themselves:

```text
mention
subscription
notification recipient
ADMIN role
capability-management authority
```

Rules:

- a user may be mentioned or subscribed **only when they already have legitimate task
  access**;
- mentioning or subscribing a user must **never** create task or comment access;
- an attempt to mention or subscribe a user who lacks access is rejected, not silently
  granted;
- **an ADMIN account can never become a task participant**, by any route — assignment,
  explicit addition, mention, or subscription. Permission Service rejects the attempt.

Mentions and subscriptions are notification routing only. They are a delivery concern,
not an authorization concern.

### 5.10.2 Task hierarchy visibility

Access is deny-by-default and per-task. The single exception is **ancestor oversight**,
defined exhaustively below.

**Ancestor oversight.** The creator and the current assignee of an ancestor task may view
a **summary** of any descendant task, at any depth. The summary consists of exactly these
fields and no others:

```text
title
status
assignee
deadline
is_overdue
completion result
```

Ancestor oversight confers **nothing else**. Specifically, it does not grant:

- descendant task comments — these require direct participation in that descendant;
- descendant document content — this requires a separate valid Grant on the document;
- descendant `TaskActivity` detail beyond the summary fields above;
- the right to act on the descendant task.

Ancestor oversight is held only by the ancestor's creator and current assignee. An
explicitly assigned participant on an ancestor task does **not** receive it.

**No other direction propagates.** A descendant-task participant cannot read:

- the parent task's comments;
- the parent task's documents;
- any sibling task, in whole or in summary.

Any of these requires separate, explicit authorization on the specific task or document.

Endpoints serving descendant summaries must project only the six fields listed above.
Reusing the full task-detail serializer for an oversight response is a defect, because it
would leak descendant detail to an ancestor participant who is not a direct participant.

### 5.10.3 Task comments

Task comments are confidential task content, not collaboration metadata. A comment thread
is where the substance of a RESTRICTED document is quoted in practice, so it carries the
same protection as document content.

Only authorized participants (§5.10.1) may:

- list comments;
- create comments.

ADMIN is denied both operations unconditionally.

MVP comment fields — exactly these, and no more:

```text
id
task_id
author_id
content
created_at
```

Not required for the MVP:

- reactions;
- nested threads or replies;
- pinning;
- edit history;
- progress percentage.

Comment list and create are audited, allow and deny alike. Comment **content** is never
written to the Audit Trail.

### 5.10.4 Task progress is a Task Management read model

`task-management-service` owns a `TaskActivity` read model in `task_db`. It is written in
the same transaction as the state change that produced it.

The UI must **not** query `audit-log-service` for progress. `audit-log-service` is an
evidence store with a single serialized writer (§5.7.1); putting it on a user-facing read
path would couple an ordinary feature to a tamper-evident ledger.

Task progress consists of:

```text
current task status
creator and assignee
deadline
derived is_overdue
parent and child tasks
status-transition history
comments
result submissions
review decisions
document-sharing activity
```

Progress is **not** a stored percentage. There is no `progress` field, no checklist
entity, and no completion number.

The same domain event feeds both `TaskActivity` (for display) and `AuditEvent` (for
evidence). These are two independent records with different purposes, different lifetimes,
and different owners. `AuditEvent` remains an independent evidence record in `audit_db`.

---

# 6. REPOSITORY STRUCTURE

```text
c17-task-document-platform/
├─ apps/
│  ├─ api-gateway/
│  ├─ authentication-identity-service/
│  ├─ user-role-management-service/
│  ├─ task-management-service/
│  ├─ document-management-service/
│  ├─ document-security-service/
│  ├─ permission-service/
│  ├─ audit-log-service/
│  ├─ notification-service/
│  └─ security-monitoring-service/
├─ libs/
│  ├─ contracts/
│  ├─ auth-context/
│  ├─ config/
│  ├─ messaging/
│  ├─ observability/
│  └─ testing/
├─ prisma/
│  └─ <service-name>/
├─ infra/
├─ docs/
│  ├─ adr/
│  ├─ architecture/
│  ├─ api/
│  ├─ events/
│  ├─ decisions/
│  ├─ reports/
│  │  └─ weekly/
│  └─ evidence/
│     ├─ phase-1/
│     ├─ phase-2/
│     ├─ phase-3/
│     └─ phase-4/
├─ scripts/
├─ CONTEXT.md
├─ docker-compose.yml
├─ .env.example
├─ nest-cli.json
├─ package.json
├─ pnpm-lock.yaml
└─ README.md
```

There is exactly one root `package.json` and one `pnpm-lock.yaml` (§4.1). There is no
`pnpm-workspace.yaml` and no per-application `package.json`.

---

# 7. DATABASE AND SERVICE OWNERSHIP

Use one local PostgreSQL container if desired, but keep separate databases or schemas:

```text
auth_db
user_role_db
task_db
document_db
document_security_db
permission_db
audit_db
notification_db
security_monitoring_db
```

Rules:

- no cross-service foreign key;
- no cross-service database query;
- no shared Prisma repository;
- store external IDs only;
- synchronize through internal API or event;
- keep migrations per service.

Deliberate denormalizations permitted by ADR: `effective_expires_at` on the Grant row in
`permission_db` (§5.5.2), and `TaskActivity` in `task_db` (§5.10.4). These are the only
sanctioned duplications. Any further cross-service denormalization requires a new ADR.

---

# 8. COMMUNICATION CONTRACTS

## 8.1 Permission check

```text
POST /internal/permissions/check
```

Example request:

```json
{
  "actor_id": "uuid",
  "resource_type": "DOCUMENT",
  "resource_id": "uuid",
  "action": "DOWNLOAD",
  "task_id": "uuid",
  "correlation_id": "uuid"
}
```

Example response:

```json
{
  "allowed": false,
  "reason_code": "GRANT_EXPIRED",
  "effective_expires_at": "2026-07-26T12:00:00Z"
}
```

Every content endpoint must use this decision. Every task-comment and archive endpoint
must use it too.

Reason codes must at minimum include:

```text
NO_GRANT
GRANT_EXPIRED
GRANT_REVOKED
PARENT_GRANT_INVALID
ADMIN_CONTENT_DENIED
NOT_A_PARTICIPANT
MISSING_CAPABILITY
PERMISSION_SERVICE_UNAVAILABLE
```

The caller must never supply `task.deadline` or any expiry value. Permission Service
resolves expiry from its own `permission_db` only (§5.5.2). A caller-supplied expiry would
let the caller widen the access that gates it.

Timeout, connection refused, and 5xx all produce a denial (§5.5.3). Recommended client
timeout: 2 seconds.

## 8.2 RabbitMQ event envelope

```json
{
  "event_id": "uuid",
  "event_type": "permission.grant.expired",
  "occurred_at": "ISO-8601",
  "producer": "permission-service",
  "correlation_id": "uuid",
  "actor_id": "uuid|null",
  "resource_type": "permission_grant",
  "resource_id": "uuid",
  "schema_version": 1,
  "payload": {}
}
```

Important consumers must be:

- idempotent;
- retryable;
- connected to DLQ;
- free of raw document content and comment content;
- compatible with Outbox Pattern for transactional publication.

`audit-log-service` is the exception to horizontal scaling: it runs at a single replica
with `prefetch=1` (§5.7.1). Its idempotency is implemented inside the locked append
transaction, not by a general-purpose dedupe layer (§5.7.2).

---

# 9. PLANNED / RETROSPECTIVE PHASE WINDOWS AND BRANCHES

The ranges below are **planned / retrospective phase windows**. They are reporting and
planning metadata. They are not implementation deadlines and they do not assert when work
actually happened.

| Phase | Planned / retrospective window | Single branch | Commits |
|---|---|---|---:|
| Phase 1 | July 1–7, 2026 | `phase/01-foundation-auth-permission` | 3 |
| Phase 2 | July 8–14, 2026 | `phase/02-task-document-timed-grants` | 3 |
| Phase 3 | July 15–21, 2026 | `phase/03-expiry-review-audit-monitoring` | 3 |
| Phase 4 | July 22–August 4, 2026 | `phase/04-archive-release-evidence` | 3 |

Actual implementation dates are recorded per phase in the evidence pack and in the weekly
reports. Actual Git timestamps are authoritative and must never be altered (§1.5).

A phase branch must be created from the latest approved `main`.

Do not start the next phase until the current phase is explicitly approved and merged, and
the user has sent `START PHASE X+1`.

---

# 10. PHASE 1 — FOUNDATION, AUTHENTICATION, AND PERMISSION BASELINE

**Planned / retrospective window:** July 1–7, 2026  
**Branch:** `phase/01-foundation-auth-permission`  
**Commits:** exactly 3

## 10.1 Commit 1

**Planned date:** July 2

```text
chore(phase1): bootstrap ten NestJS services and local infrastructure
```

Build:

- NestJS monorepo managed by pnpm (§4.1): one root `package.json`, one `nest-cli.json`,
  one `pnpm-lock.yaml`;
- Ten required applications, each independently runnable;
- Shared libraries under `libs/`;
- Docker Compose:
  - PostgreSQL;
  - Redis;
  - RabbitMQ;
  - MinIO;
  - ClamAV.
- Environment validation.
- Structured logging.
- Correlation ID.
- Health endpoint for ten services.
- Root lint/test/build scripts.
- CI baseline.

Checklist:

- [ ] Ten apps build.
- [ ] Ten apps start independently.
- [ ] No `pnpm-workspace.yaml` and no per-app `package.json`.
- [ ] Docker Compose validates.
- [ ] Ten health endpoints respond.
- [ ] Dependencies are pinned.
- [ ] No secret is committed.

## 10.2 Commit 2

**Planned date:** July 5

```text
feat(phase1): implement identity sessions and user-role administration
```

Build:

- password hashing;
- login;
- short-lived access token;
- refresh rotation;
- logout;
- revoke;
- user;
- department;
- ADMIN/EMPLOYEE;
- capabilities (§5.2.2);
- lock/unlock;
- Gateway JWT validation;
- Redis session metadata;
- failed-login, session-revoked, and user-locked events.

Checklist:

- [ ] Locked user cannot log in.
- [ ] Locked user cannot refresh.
- [ ] Refresh token can be revoked.
- [ ] Capability can be granted only to an EMPLOYEE.
- [ ] ADMIN cannot be granted a content-adjacent capability.
- [ ] Capability grant is audited.
- [ ] Swagger is updated.
- [ ] Auth and user-role tests pass.

## 10.3 Commit 3

**Planned date:** July 7

```text
feat(phase1): enforce permission baseline and admin content hard-deny
```

Build:

- Permission Service baseline;
- `/internal/permissions/check`;
- default deny;
- fail-closed behaviour with no allow-cache (§5.5.3);
- RBAC/capability evaluation;
- ADMIN content hard-deny including DISPOSE (§5.2.1);
- ADMIN cannot become a task participant (§5.10.1);
- Audit Log append-only baseline;
- canonical payload;
- hash chain with single serialized writer (§5.7.1);
- `event_id` dedupe inside the locked append transaction (§5.7.2);
- retry/DLQ baseline;
- Task and Document skeleton integration.

Checklist:

- [ ] ADMIN content access is denied.
- [ ] ADMIN is denied DISPOSE.
- [ ] ADMIN cannot be added as a task participant.
- [ ] User without grant is denied.
- [ ] Permission Service unavailability produces a denial, not an allow.
- [ ] Allow and deny are audited.
- [ ] Hash-chain test passes.
- [ ] Concurrent-append test does not fork the chain.
- [ ] Redelivered event does not duplicate or fork the chain.
- [ ] Event consumer is idempotent.
- [ ] TC01–TC03 evidence exists.

## 10.4 Phase 1 local stop point

After Commit 3:

- run all checks;
- do not push;
- do not create a PR;
- do not merge;
- do not create Phase 2 branch;
- produce the Phase Stop Report;
- wait for explicit user authorization.

---

# 11. PHASE 2 — TASKS, SECURE DOCUMENTS, AND TIMED GRANTS

**Planned / retrospective window:** July 8–14, 2026  
**Branch:** `phase/02-task-document-timed-grants`  
**Commits:** exactly 3

Create this branch only after Phase 1 has been approved and merged and the user has sent
`START PHASE 2`.

## 11.1 Commit 1

**Planned date:** July 9

```text
feat(phase2): implement task lifecycle and hierarchical assignments
```

Build:

- task lifecycle (§5.3);
- deadline;
- derived `is_overdue` (§5.3.1) — computed on read, never stored;
- stored `blocked`, `blocked_reason`, `previous_status` (§5.3.1);
- creator/assignee;
- explicit task participants (§5.10.1);
- child task, all children required (§5.3);
- result submission;
- comments with MVP fields only (§5.10.3);
- mention/subscriber as notification routing only, never as access (§5.10.1);
- `TaskActivity` read model (§5.10.4);
- task events;
- audit events.

Checklist:

- [ ] Invalid transition is rejected.
- [ ] Child task keeps parent link.
- [ ] Parent cannot be APPROVED while any child is not APPROVED.
- [ ] Wrong actor cannot review.
- [ ] `is_overdue` is computed, and no column stores it.
- [ ] Non-participant cannot list or create comments.
- [ ] ADMIN cannot list or create comments.
- [ ] ADMIN cannot be added as a participant by any route.
- [ ] Mentioning a user without access is rejected and grants nothing.
- [ ] Ancestor creator/assignee sees a descendant summary of exactly six fields.
- [ ] Ancestor creator/assignee cannot read descendant comments.
- [ ] Ancestor creator/assignee cannot read descendant document content.
- [ ] An explicitly assigned ancestor participant gets no oversight of descendants.
- [ ] Descendant participant cannot read the parent task's comments or documents.
- [ ] Participant cannot read a sibling task in whole or in summary.
- [ ] Comment content never appears in an audit event.
- [ ] `TaskActivity` is written in the same transaction as the state change.
- [ ] Progress endpoint does not call `audit-log-service`.
- [ ] State-machine tests pass.

## 11.2 Commit 2

**Planned date:** July 12

```text
feat(phase2): secure document upload versioning and download tickets
```

Build:

- upload through Gateway;
- state-secret declaration rejected before Document creation (§5.4.1);
- size/MIME validation;
- HTTP streaming handoff to `document-security-service` (§5.6.2);
- ClamAV scan;
- SHA-256;
- AES-256-GCM;
- envelope encryption with versioned KEK (§5.6.1);
- signature;
- ciphertext in MinIO;
- document metadata;
- versioning;
- secure preview/download ticket;
- plaintext temporary-file cleanup in a `finally` block (§5.6.2).

Checklist:

- [ ] Raw file is not stored in DB.
- [ ] Ciphertext is stored.
- [ ] Checksum verifies.
- [ ] Signature verifies.
- [ ] Wrapped DEK records `kek_version`.
- [ ] Update creates a new version with a new DEK.
- [ ] Unauthorized download is denied.
- [ ] State-secret declaration creates no Document row and no MinIO object.
- [ ] Temporary plaintext is deleted on the success path.
- [ ] Temporary plaintext is deleted on the scan-failure path.
- [ ] Temporary plaintext is deleted on the exception path.
- [ ] The two document services share no filesystem volume.
- [ ] `object_key` is never returned to a client.

## 11.3 Commit 3

**Planned date:** July 14

```text
feat(phase2): add timed document grants and bounded delegation
```

Build:

- PermissionGrant model;
- task creation with grants;
- mandatory non-nullable `source_task_id` (§5.5.1);
- explicit `expires_at`;
- `effective_expires_at` denormalized at creation (§5.5.2);
- deadline-change event consumer in `permission-service`;
- parent grant;
- delegated grant;
- permission subset validation;
- expiration bound validation;
- task/document/grant Outbox;
- assignment/share notifications.

Checklist:

- [ ] Grant always contains expiration.
- [ ] Grant cannot be created without `source_task_id`.
- [ ] Grant does not exceed task deadline.
- [ ] Child grant is a permission subset.
- [ ] Child expiration does not exceed parent.
- [ ] User without SHARE cannot delegate.
- [ ] Permission check performs no query against `task_db`.
- [ ] Deadline-change event recomputes affected grants.
- [ ] Extending a deadline does not widen an existing grant.
- [ ] ADMIN remains content-denied.
- [ ] TC04–TC06 pass.

## 11.4 Phase 2 local stop point

After Commit 3:

- run all checks;
- do not push;
- do not create a PR;
- do not merge;
- do not create Phase 3 branch;
- produce the Phase Stop Report;
- wait for explicit user authorization.

---

# 12. PHASE 3 — COMPLETE EXPIRATION REVOCATION, REVIEW, AUDIT, AND MONITORING

**Planned / retrospective window:** July 15–21, 2026  
**Branch:** `phase/03-expiry-review-audit-monitoring`  
**Commits:** exactly 3

Create this branch only after Phase 2 has been approved and merged and the user has sent
`START PHASE 3`.

## 12.1 Commit 1

**Planned date:** July 16

```text
feat(phase3): revoke all task-derived permissions at effective expiry
```

Build:

- request-time expiration decision;
- expiration worker;
- mark EXPIRED;
- revoke all permissions;
- cascade descendant invalidation;
- deadline event;
- expired-grant event;
- ticket lifetime bounded by grant expiration;
- no automatic restoration after deadline extension.

Checklist:

- [ ] VIEW is denied after expiration.
- [ ] DOWNLOAD is denied after expiration.
- [ ] UPDATE is denied after expiration.
- [ ] SHARE is denied after expiration.
- [ ] TRANSFER/ARCHIVE/DISPOSE are denied.
- [ ] Child grants become ineffective.
- [ ] Access-time denial works before worker execution.
- [ ] Worker is idempotent.
- [ ] An issued ticket cannot outlive `effective_expires_at`.
- [ ] TC07 passes.

## 12.2 Commit 2

**Planned date:** July 19

```text
feat(phase3): implement review workflow and parent-child completion rules
```

Build:

- submit result;
- WAITING_REVIEW;
- APPROVED;
- NEED_REVISION;
- REJECTED;
- correct reviewer rule;
- parent-child approval rule, all children required (§5.3);
- review notifications;
- review audit;
- task-approved event.

Checklist:

- [ ] Wrong reviewer is denied.
- [ ] NEED_REVISION returns to IN_PROGRESS.
- [ ] Parent approval is blocked when any child is incomplete.
- [ ] Parent approval succeeds after all children are approved.
- [ ] Approval does not restore expired grants.
- [ ] Review decisions appear in `TaskActivity`.
- [ ] TC08 passes.

## 12.3 Commit 3

**Planned date:** July 21

```text
feat(phase3): add tamper-evident audit monitoring and security notifications
```

Build:

- complete audit payload;
- hash-chain verification walk;
- failed-login rule;
- denied-access rule;
- abnormal-download rule;
- abnormal-share rule;
- access-after-expiration rule;
- invalid-checksum/signature rule;
- alert lifecycle;
- email adapter;
- in-app notifications;
- temporary lock policy;
- DLQ evidence.

Checklist:

- [ ] Audit contains actor/resource/action/result/reason/time.
- [ ] Tampering is detected in tests.
- [ ] Chain verification walks from genesis.
- [ ] Alert deduplication works.
- [ ] Thresholds are configurable.
- [ ] Notification does not expose raw sensitive data.
- [ ] Notification does not expose comment content.
- [ ] Security lock revokes refresh sessions.
- [ ] TC09 passes.

## 12.4 Phase 3 local stop point

After Commit 3:

- run all checks;
- do not push;
- do not create a PR;
- do not merge;
- do not create Phase 4 branch;
- produce the Phase Stop Report;
- wait for explicit user authorization.

---

# 13. PHASE 4 — ARCHIVE, TRANSFER, DISPOSAL, AND RELEASE

**Planned / retrospective window:** July 22–August 4, 2026  
**Branch:** `phase/04-archive-release-evidence`  
**Commits:** exactly 3

Create this branch only after Phase 3 has been approved and merged and the user has sent
`START PHASE 4`.

## 13.1 Commit 1

**Planned date:** July 24

```text
feat(phase4): implement records and signed archive transfer packages
```

Build:

- Record entity;
- attach document version;
- close record;
- DRAFT/SEALED/SUBMITTED package;
- manifest;
- metadata;
- checksums;
- package signature;
- audit references;
- `can_submit_archive_package` via `ARCHIVE_SUBMIT` capability (§5.2.2);
- TRANSFER and ARCHIVE checks.

Checklist:

- [ ] Invalid record cannot be sealed.
- [ ] Manifest matches file versions.
- [ ] Every file has checksum.
- [ ] Package signature verifies.
- [ ] Submit requires TRANSFER and `ARCHIVE_SUBMIT`.
- [ ] ADMIN cannot submit a package.
- [ ] Close/seal/submit are audited.
- [ ] TC10 passes.

## 13.2 Commit 2

**Planned date:** July 29

```text
feat(phase4): verify handover packages and implement controlled disposal
```

Build:

- RECEIVED_CHECKING;
- Archivist reception via `ARCHIVE_RECEIVE` capability (§5.2.2);
- separation of duties between submitter and Archivist (§5.2.3);
- virus/checksum/signature/metadata validation;
- ACCEPTED or REJECTED;
- rejection reason;
- handover receipt;
- retention policy;
- DISPOSED_ELIGIBLE;
- disposal approval via `DISPOSAL_APPROVE` capability;
- object deletion by policy;
- persistent audit;
- notifications.

Checklist:

- [ ] Missing file causes rejection.
- [ ] Invalid checksum causes rejection.
- [ ] Invalid signature causes rejection.
- [ ] Malware/scan failure causes rejection or quarantine.
- [ ] Accepted package becomes ARCHIVED.
- [ ] Submitter cannot accept their own package.
- [ ] ADMIN cannot receive, accept, or reject a package.
- [ ] ADMIN cannot approve a disposal.
- [ ] Retention end does not delete immediately.
- [ ] Disposal requires permission and approval.
- [ ] Audit remains after disposal.
- [ ] TC11 passes.

## 13.3 Commit 3

**Planned date:** August 4

```text
test(phase4): finalize dockerized end-to-end demo and evidence pack
```

Build:

- complete Docker Compose;
- repeatable migration;
- seed users and documents;
- short-deadline expiry demo;
- TC01–TC12 E2E;
- Swagger/OpenAPI;
- API collection;
- CI;
- backup/restore scripts;
- architecture diagram;
- event catalog;
- final evidence package;
- final weekly report (§15).

Checklist:

- [ ] Clean startup works.
- [ ] Ten health endpoints pass.
- [ ] Migrations work.
- [ ] Seed is repeatable.
- [ ] TC01–TC12 pass.
- [ ] Swagger is available.
- [ ] No secret exists in repository.
- [ ] Reset instructions exist.
- [ ] Evidence is complete.
- [ ] Every evidence report records planned window and actual date.

## 13.4 Phase 4 local stop point

After Commit 3:

- run all checks;
- do not push;
- do not create a PR;
- do not merge;
- do not tag;
- produce the Phase Stop Report;
- wait for explicit user authorization.

---

# 14. PHASE STOP REPORT

At the end of every phase, the agent must return exactly this structure:

```markdown
# PHASE STOP REPORT

## Phase
- Phase number:
- Planned / retrospective window:
- Actual implementation dates:
- Local branch:
- Current base commit:
- Current branch HEAD:

## Local commits
| Order | Commit hash | Commit message |
|---|---|---|
| 1 | ... | ... |
| 2 | ... | ... |
| 3 | ... | ... |

## Implemented
- ...

## Services changed
- ...

## Database migrations
- ...

## APIs changed
- ...

## Events changed
- ...

## Test cases
- ...

## Verification
- [PASS/FAIL] install
- [PASS/FAIL] lint
- [PASS/FAIL] unit tests
- [PASS/FAIL] integration tests
- [PASS/FAIL] build
- [PASS/FAIL] Docker Compose config
- [PASS/FAIL] health smoke tests
- [PASS/FAIL] phase E2E tests

## Evidence
- Local path:
- Files:

## Known issues
- ...

## Remote status
- Branch pushed: NO
- Pull Request created: NO
- Merged to main: NO

## Required user decision
Choose one:
1. APPROVE PUSH PHASE X
2. REQUEST CHANGES PHASE X
3. CANCEL PHASE X

Status: WAITING FOR HUMAN REVIEW
```

The agent must not continue after printing this report.

---

# 15. WEEKLY REPORT

The team submits one progress report every week to the supervisor, **Mr. Nguyen Anh Hao**.

**Default cadence:** every Sunday.

A weekly report is a factual status record. It is written to:

```text
docs/reports/weekly/week-<N>-<YYYY-MM-DD>.md
```

Every weekly report must contain:

- planned phase;
- actual work completed;
- local branch and commit hashes;
- push / Pull Request / merge status;
- tests and evidence;
- blockers;
- next-week plan.

## 15.1 Accuracy rules

- A weekly report must **never** claim that a branch was pushed when it was not.
- A weekly report must **never** claim that a Pull Request exists when it does not.
- A weekly report must **never** claim that a merge happened when it did not.
- Commit hashes must be real, and copied from `git log`, not invented.
- A Pull Request URL is recorded only if the Pull Request actually exists.
- Test results must reflect an actual run. If a suite was not run, write `NOT RUN`, not
  `PASS`.
- The planned window and the actual implementation dates are both recorded, even when
  they diverge. Divergence is reported, never hidden or smoothed.
- If nothing was completed in a week, say so. An empty week is a valid report.

## 15.2 Weekly report template

```markdown
# WEEKLY REPORT — Week <N>

- Report date:
- Submitted to: Mr. Nguyen Anh Hao
- Planned phase:
- Planned / retrospective phase window:
- Actual implementation dates this week:

## Local branch
- Branch name:
- Branch created from:
- Branch HEAD:

## Actual work completed this week
- <what was genuinely finished; if nothing, say so>

## Local commits this week
| Order | Commit hash | Date (actual) | Commit message |
|---|---|---|---|
| 1 | ... | ... | ... |
| 2 | ... | ... | ... |
| 3 | ... | ... | ... |

## Remote status
- Branch pushed: YES / NO
- Remote branch name: <name or NONE>
- Push authorized by: <APPROVE PUSH PHASE X or NOT AUTHORIZED>
- Pull Request created: YES / NO
- Pull Request URL: <url or NONE>
- Merged to main: YES / NO
- Main merge commit: <hash or NONE>

## Test results
| Check | Result |
|---|---|
| install | PASS / FAIL / NOT RUN |
| lint | PASS / FAIL / NOT RUN |
| unit tests | PASS / FAIL / NOT RUN |
| integration tests | PASS / FAIL / NOT RUN |
| build | PASS / FAIL / NOT RUN |
| Docker Compose config | PASS / FAIL / NOT RUN |
| health smoke tests | PASS / FAIL / NOT RUN |
| phase E2E tests | PASS / FAIL / NOT RUN |

## Test cases covered
- TC..: <status>

## Evidence paths
- docs/evidence/phase-X/
- <specific files produced this week>

## Blockers
- <blocker, owner, and what is needed to clear it, or NONE>

## Next-week plan
- <specific, verifiable intentions>

## Schedule variance
- Planned window:
- Actual dates:
- Variance and reason:
```

---

# 16. ACTION AFTER USER APPROVES PUSH

After receiving:

```text
APPROVE PUSH PHASE X
```

the agent may run only:

```bash
git status
git log --oneline --decorate -10
git push -u origin <current-phase-branch>
```

Then the agent must stop and report:

```markdown
# PUSH REPORT

- Phase:
- Branch:
- Remote:
- Push result:
- Remote branch:
- Latest commit:
- Pull Request created: NO
- Merged: NO

Required user decision:
1. APPROVE PR PHASE X
2. REQUEST CHANGES PHASE X

Status: WAITING FOR HUMAN REVIEW
```

Do not create a Pull Request automatically.

---

# 17. ACTION AFTER USER APPROVES PULL REQUEST CREATION

After receiving:

```text
APPROVE PR PHASE X
```

the agent may create a Pull Request from the current phase branch into `main`.

The Pull Request title should describe the entire phase:

```text
Phase 1: foundation, authentication, and permission baseline
Phase 2: tasks, secure documents, and timed grants
Phase 3: expiration revocation, review, audit, and monitoring
Phase 4: archive lifecycle and release evidence
```

Pull Request body:

```markdown
## Phase
- Planned / retrospective window:
- Actual implementation dates:

## Branch
- ...

## Commits
- ...

## Scope
- ...

## Services changed
- ...

## Business rules covered
- ...

## ADRs applied
- ...

## Migrations
- ...

## APIs and events
- ...

## Tests
- [ ] lint
- [ ] unit
- [ ] integration
- [ ] build
- [ ] Docker config
- [ ] smoke
- [ ] phase E2E

## Evidence
- docs/evidence/phase-X/

## Known limitations
- ...
```

Tick a test checkbox only if that check actually ran and passed.

After creating the Pull Request, stop and report:

```markdown
# PULL REQUEST REPORT

- Phase:
- Branch:
- Pull Request URL:
- Pull Request number:
- Base: main
- Checks:
- Merge executed: NO

Required user decision:
1. APPROVE MERGE PHASE X
2. REQUEST CHANGES PHASE X

Status: WAITING FOR HUMAN REVIEW
```

---

# 18. ACTION AFTER USER APPROVES MERGE

After receiving:

```text
APPROVE MERGE PHASE X
```

the agent may:

1. confirm CI is green;
2. squash merge the Pull Request;
3. update local `main`;
4. report the final main commit;
5. stop.

The agent must not create the next phase branch until the user sends:

```text
START PHASE X+1
```

Merge report:

```markdown
# MERGE REPORT

- Phase:
- Pull Request:
- Merge strategy: squash
- Main commit:
- Merge result:
- Phase branch deleted:
- Tag created: NO

Required user decision:
1. APPROVE TAG PHASE X
2. START PHASE X+1
3. STOP

Status: WAITING FOR HUMAN REVIEW
```

---

# 19. EVIDENCE STRUCTURE

Each phase has one evidence directory:

```text
docs/evidence/phase-X/
  summary.md
  commit-history.txt
  commands.md
  test-results.txt
  build-results.txt
  docker-status.txt
  api-samples/
  event-samples/
  screenshots/
  logs/
```

`summary.md`:

```markdown
# Evidence — Phase X

- Planned / retrospective window:
- Actual implementation range:
- Local branch:
- Remote branch:
- Pull Request:
- Main merge commit:
- Actual author:

## Commits
- ...

## Completed
- ...

## Tests
- ...

## API evidence
- ...

## Event evidence
- ...

## Database evidence
- ...

## Known limitations
- ...

## Schedule variance
- Planned window:
- Actual dates:
- Reason for variance:
```

Both the planned window and the actual implementation date are mandatory in every
evidence report.

Never include:

- passwords;
- active JWTs;
- private keys;
- production credentials;
- raw confidential documents;
- task comment content;
- real personal data.

---

# 20. TEST CASE OWNERSHIP

Backend coding remains Sang's responsibility.

| TC | Review/evidence owner | Backend implementer | Scenario |
|---|---|---|---|
| TC01 | Sang | Sang | Login, token expiration, logout/revoke |
| TC02 | Son | Sang | User lock/unlock and session revoke |
| TC03 | Tri | Sang | ADMIN content hard-deny |
| TC04 | Sang | Sang | Task and timed document grant |
| TC05 | Son | Sang | Exact assignee permission boundaries |
| TC06 | Tri | Sang | Child task and bounded delegation |
| TC07 | Sang | Sang | Complete permission revocation at expiry |
| TC08 | Son | Sang | Review and parent-child approval |
| TC09 | Tri | Sang | Audit, monitoring, notification |
| TC10 | Sang | Sang | Record and transfer package |
| TC11 | Son | Sang | Receive/reject, retention, disposal |
| TC12 | Tri | Sang | Full Dockerized E2E and evidence |

Do not claim that a test-case reviewer wrote backend code unless that contribution is real.

---

# 21. AGENT PROHIBITIONS

The agent must not:

- create more than one branch per phase;
- create more or fewer than three local commits per phase;
- push before explicit approval;
- create a PR before explicit approval;
- merge before explicit approval;
- start the next phase before explicit approval;
- alter, backdate, or rewrite real Git timestamps;
- collapse the ten services;
- introduce a `pnpm-workspace.yaml` or per-application `package.json`;
- bypass Permission Service;
- allow a permission-check failure to result in an allow;
- add an allow-cache in front of Permission Service;
- let ADMIN access document content;
- let ADMIN access task comments;
- let ADMIN become a task participant;
- let ADMIN hold a content-adjacent capability;
- let a mention, subscription, or notification create task or comment access;
- let ancestor oversight return more than the six summary fields in §5.10.2;
- let ancestor participation grant access to descendant comments or document content;
- let a descendant-task participant read a parent task's comments or documents;
- let any participant read a sibling task without separate authorization;
- retain VIEW after expiration;
- rely only on the expiration scheduler;
- let delegated grants exceed parent permissions or time;
- create a document grant without `source_task_id`;
- query `task_db` from `permission-service`;
- run `audit-log-service` at more than one replica;
- move the audit dedupe check outside the locked append transaction;
- store raw documents in PostgreSQL;
- store a task progress percentage;
- query `audit-log-service` for task progress;
- expose MinIO object keys;
- share a filesystem volume between the two document services;
- leave plaintext temporary files undeleted on any code path;
- log secrets, comment content, or raw sensitive data;
- access another service's database;
- create cross-service foreign keys;
- remove tests to obtain green CI;
- commit `.env` or private keys;
- fabricate evidence;
- claim a push, Pull Request, or merge that did not happen;
- change authorship;
- rewrite Git history without explicit instruction;
- implement a production KMS, a rotation scheduler, or a bulk re-wrap migration (§5.6.1);
- use the planned phase windows to justify reducing scope (§9);
- add Performance/Scoring before the core release is complete.

---

# 22. FINAL RELEASE CHECKLIST

## Architecture

- [ ] Ten independent NestJS servers.
- [ ] NestJS monorepo managed by pnpm, single root manifest.
- [ ] One API Gateway.
- [ ] Separate data ownership.
- [ ] RabbitMQ retry and DLQ.
- [ ] Redis sessions/rate limits.
- [ ] MinIO ciphertext storage.
- [ ] ClamAV scan.
- [ ] Docker Compose.
- [ ] Swagger.
- [ ] Health checks.

## Business

- [ ] Timed permissions.
- [ ] Complete expiration revocation.
- [ ] Bounded delegation.
- [ ] Every grant bound to a task.
- [ ] ADMIN content hard-deny including DISPOSE.
- [ ] ADMIN excluded from task participation and comments.
- [ ] Task hierarchy with all children required.
- [ ] Confidential task comments.
- [ ] Task progress served from `TaskActivity`, not audit.
- [ ] Secure file pipeline with versioned KEK.
- [ ] State-secret material rejected before Document creation.
- [ ] Audit allow and deny, single-writer hash chain.
- [ ] Security alerts.
- [ ] Records and transfer packages via EMPLOYEE capabilities.
- [ ] Controlled disposal.

## Git control

- [ ] Four phase branches only.
- [ ] Exactly three meaningful commits per phase.
- [ ] No unauthorized push.
- [ ] No unauthorized PR.
- [ ] No unauthorized merge.
- [ ] Human approval at every stop point.
- [ ] Real authorship.
- [ ] Real, unaltered timestamps.
- [ ] Real evidence.
- [ ] Weekly reports contain actual hashes and links, and claim nothing that did not happen.

---

# 23. RESOLVED DECISIONS

All decisions previously open in V3 are settled. They are recorded here with their
resolution and the section that governs them. The agent must not reopen or reinterpret
these; if implementation reveals one is wrong, stop and report.

1. **Task hierarchy visibility — RESOLVED.** Deny-by-default and per-task. Direct
   participants read full task detail; the creator and current assignee of an ancestor task
   may additionally read a six-field summary of any descendant. Nothing propagates upward or
   sideways. Governed by §5.10.2 and ADR-0004.
2. **Actual project schedule — RESOLVED as out of scope for this plan.** The schedule is
   managed by the user outside this document. The July 1 – August 4 windows remain
   retrospective reporting metadata only. They are not deadlines, and they must never be
   used to justify reducing scope. Evidence and weekly reports record both the planned
   window and the actual implementation date. Governed by §1.5 and §9.
3. **KEK rotation — RESOLVED as not required.** The ADR-0003 versioned scaffold is
   sufficient and complete: `kek_version` on every wrapped DEK, version-selecting unwrap,
   active-version wrapping for new document versions, and a provider interface that admits a
   future rotation implementation. A production KMS, an automatic rotation scheduler, and a
   bulk re-wrap migration are explicitly out of scope. Governed by §5.6.1.
4. **Weekly report cadence and recipient — RESOLVED.** One report per week to the
   supervisor, Mr. Nguyen Anh Hao, by default every Sunday. Required contents are listed in
   §15, and the accuracy rules in §15.1 bind it absolutely. Governed by §15.

There are no remaining open decisions.

---

# 24. FINAL AGENT COMMAND

The initial instruction to the agent should be:

```text
Read C17_BACKEND_AI_AGENT_PLAN_ENGLISH_V3.md completely.
Read CONTEXT.md and docs/adr/0001 through 0004 completely.

Implement only Phase 1 on the single local branch:
phase/01-foundation-auth-permission

Create exactly three Phase 1 commits described in the plan.
Run every required check.
Do not push.
Do not create a Pull Request.
Do not merge.
Do not create the Phase 2 branch.

At completion, print the required PHASE STOP REPORT and wait for my decision.
```
