# C17 BACKEND IMPLEMENTATION PLAN FOR AI CODING AGENTS — V2

> **Project:** Task Assignment and Secure Digital Document Sharing Platform for Organizations  
> **Team:** C17  
> **Primary Backend Implementer:** N22DCCN068 — Nguyen Luu Tan Sang  
> **Implementation Style:** Full backend implementation by Sang; progress tracked by end-to-end test cases  
> **Architecture:** NestJS microservices, PostgreSQL, Redis, RabbitMQ, MinIO, ClamAV, Docker Compose  
> **Timeline:** July 1, 2026 to August 4, 2026  
> **Branch Policy:** Exactly one working branch per phase  
> **Push Policy:** The AI agent must never push code unless the user explicitly authorizes that push  
> **Merge Policy:** The AI agent must never merge into `main` unless the user explicitly authorizes that merge

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

Each phase branch contains two or three meaningful commits.

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
-> create local commits
-> STOP and report
-> user approves push
-> push phase branch
-> STOP and report
-> user approves Pull Request creation
-> create Pull Request
-> STOP and report
-> user reviews
-> user approves merge
-> squash merge into main
-> STOP and report
-> user approves next phase
```

## 1.5 Git history must remain factual

The timeline in this document is the planned or reported project timeline.

The agent must preserve actual Git authorship and actual commit timestamps.

If implementation occurs later than the planned phase dates, record both:

```text
Planned phase date
Actual implementation date
```

Do not fabricate historical work, authorship, tests, Pull Requests, or evidence.

---

# 2. SOURCE OF TRUTH

Implementation priority:

1. Supervisor requirements.
2. The approved C17 Business Design.
3. This implementation plan.
4. Technical decisions made during coding.

The agent must not silently change a business rule because another design seems easier.

---

# 3. REQUIRED BACKEND SERVERS

The repository must contain all ten required NestJS servers:

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
Package manager: pnpm workspace
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

ADMIN may manage:

- users;
- roles;
- capabilities;
- lock/unlock;
- policies;
- alerts;
- audit metadata.

ADMIN must not:

- preview document content;
- download document content;
- update document content;
- share document content;
- transfer document content.

This must be enforced by Permission Service and document-content endpoints.

## 5.3 Task lifecycle

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

- A task becomes OVERDUE after its deadline.
- BLOCKED stores a reason and the previous status.
- The creator may cancel according to policy.
- An assignee may create a child task.
- The parent assignee becomes the child-task creator.
- The child-task creator reviews the child task.
- A parent task cannot become APPROVED until all required child tasks are APPROVED.

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

The demo must reject documents declared to be state-secret material.

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

Effective expiration:

```text
effective_expires_at = min(
  grant.expires_at,
  task.deadline,
  parent_grant.effective_expires_at
)
```

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

Permission Service must deny at request time even if the scheduled worker has not updated the database.

Parent expiration or revocation invalidates every descendant grant.

Extending a task deadline must not automatically restore an expired grant.

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
- record closure;
- archive transfer;
- package acceptance/rejection;
- controlled disposal.

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

Retention expiration must not delete a document immediately.

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
│  ├─ architecture/
│  ├─ api/
│  ├─ events/
│  ├─ decisions/
│  ├─ reports/
│  └─ evidence/
│     ├─ phase-1/
│     ├─ phase-2/
│     ├─ phase-3/
│     └─ phase-4/
├─ scripts/
├─ docker-compose.yml
├─ .env.example
├─ nest-cli.json
├─ package.json
├─ pnpm-lock.yaml
└─ README.md
```

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

Every content endpoint must use this decision.

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
- free of raw document content;
- compatible with Outbox Pattern for transactional publication.

---

# 9. PHASE TIMELINE AND BRANCHES

| Phase | Planned range | Single branch | Commits |
|---|---|---|---:|
| Phase 1 | July 1–7, 2026 | `phase/01-foundation-auth-permission` | 3 |
| Phase 2 | July 8–14, 2026 | `phase/02-task-document-timed-grants` | 3 |
| Phase 3 | July 15–21, 2026 | `phase/03-expiry-review-audit-monitoring` | 3 |
| Phase 4 | July 22–August 4, 2026 | `phase/04-archive-release-evidence` | 3 |

A phase branch must be created from the latest approved `main`.

Do not start the next phase until the current phase is explicitly approved and merged.

---

# 10. PHASE 1 — FOUNDATION, AUTHENTICATION, AND PERMISSION BASELINE

**Planned range:** July 1–7, 2026  
**Branch:** `phase/01-foundation-auth-permission`

## 10.1 Commit 1

**Planned date:** July 2

```text
chore(phase1): bootstrap ten NestJS services and local infrastructure
```

Build:

- NestJS monorepo.
- Ten required applications.
- Shared libraries.
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
- capabilities;
- lock/unlock;
- Gateway JWT validation;
- Redis session metadata;
- failed-login, session-revoked, and user-locked events.

Checklist:

- [ ] Locked user cannot log in.
- [ ] Locked user cannot refresh.
- [ ] Refresh token can be revoked.
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
- RBAC/capability evaluation;
- ADMIN content hard-deny;
- Audit Log append-only baseline;
- canonical payload;
- hash chain;
- retry/DLQ baseline;
- Task and Document skeleton integration.

Checklist:

- [ ] ADMIN content access is denied.
- [ ] User without grant is denied.
- [ ] Allow and deny are audited.
- [ ] Hash-chain test passes.
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

**Planned range:** July 8–14, 2026  
**Branch:** `phase/02-task-document-timed-grants`

Create this branch only after Phase 1 has been approved and merged.

## 11.1 Commit 1

**Planned date:** July 9

```text
feat(phase2): implement task lifecycle and hierarchical assignments
```

Build:

- task lifecycle;
- deadline;
- OVERDUE;
- BLOCKED;
- creator/assignee;
- child task;
- result submission;
- comments;
- mention/subscriber metadata;
- task events;
- audit events.

Checklist:

- [ ] Invalid transition is rejected.
- [ ] Child task keeps parent link.
- [ ] Wrong actor cannot review.
- [ ] State-machine tests pass.

## 11.2 Commit 2

**Planned date:** July 12

```text
feat(phase2): secure document upload versioning and download tickets
```

Build:

- upload through Gateway;
- size/MIME validation;
- ClamAV scan;
- SHA-256;
- AES-256-GCM;
- envelope encryption;
- signature;
- ciphertext in MinIO;
- document metadata;
- versioning;
- secure preview/download ticket;
- temporary-file cleanup.

Checklist:

- [ ] Raw file is not stored in DB.
- [ ] Ciphertext is stored.
- [ ] Checksum verifies.
- [ ] Signature verifies.
- [ ] Update creates a new version.
- [ ] Unauthorized download is denied.

## 11.3 Commit 3

**Planned date:** July 14

```text
feat(phase2): add timed document grants and bounded delegation
```

Build:

- PermissionGrant model;
- task creation with grants;
- explicit `expires_at`;
- `effective_expires_at`;
- parent grant;
- delegated grant;
- permission subset validation;
- expiration bound validation;
- task/document/grant Outbox;
- assignment/share notifications.

Checklist:

- [ ] Grant always contains expiration.
- [ ] Grant does not exceed task deadline.
- [ ] Child grant is a permission subset.
- [ ] Child expiration does not exceed parent.
- [ ] User without SHARE cannot delegate.
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

**Planned range:** July 15–21, 2026  
**Branch:** `phase/03-expiry-review-audit-monitoring`

Create this branch only after Phase 2 has been approved and merged.

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
- parent-child approval rule;
- review notifications;
- review audit;
- task-approved event.

Checklist:

- [ ] Wrong reviewer is denied.
- [ ] NEED_REVISION returns to IN_PROGRESS.
- [ ] Parent approval is blocked when required children are incomplete.
- [ ] Parent approval succeeds after all required children are approved.
- [ ] Approval does not restore expired grants.
- [ ] TC08 passes.

## 12.3 Commit 3

**Planned date:** July 21

```text
feat(phase3): add tamper-evident audit monitoring and security notifications
```

Build:

- complete audit payload;
- hash-chain verification;
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
- [ ] Alert deduplication works.
- [ ] Thresholds are configurable.
- [ ] Notification does not expose raw sensitive data.
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

**Planned range:** July 22–August 4, 2026  
**Branch:** `phase/04-archive-release-evidence`

Create this branch only after Phase 3 has been approved and merged.

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
- `can_submit_archive_package`;
- TRANSFER and ARCHIVE checks.

Checklist:

- [ ] Invalid record cannot be sealed.
- [ ] Manifest matches file versions.
- [ ] Every file has checksum.
- [ ] Package signature verifies.
- [ ] Submit requires TRANSFER.
- [ ] Close/seal/submit are audited.
- [ ] TC10 passes.

## 13.2 Commit 2

**Planned date:** July 29

```text
feat(phase4): verify handover packages and implement controlled disposal
```

Build:

- RECEIVED_CHECKING;
- virus/checksum/signature/metadata validation;
- ACCEPTED or REJECTED;
- rejection reason;
- handover receipt;
- retention policy;
- DISPOSED_ELIGIBLE;
- disposal approval;
- object deletion by policy;
- persistent audit;
- notifications.

Checklist:

- [ ] Missing file causes rejection.
- [ ] Invalid checksum causes rejection.
- [ ] Invalid signature causes rejection.
- [ ] Malware/scan failure causes rejection or quarantine.
- [ ] Accepted package becomes ARCHIVED.
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
- final evidence package.

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
- Planned date range:
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

# 15. ACTION AFTER USER APPROVES PUSH

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

# 16. ACTION AFTER USER APPROVES PULL REQUEST CREATION

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
- ...

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

## Migrations
- ...

## APIs and events
- ...

## Tests
- [x] lint
- [x] unit
- [x] integration
- [x] build
- [x] Docker config
- [x] smoke
- [x] phase E2E

## Evidence
- docs/evidence/phase-X/

## Known limitations
- ...
```

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

# 17. ACTION AFTER USER APPROVES MERGE

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

# 18. EVIDENCE STRUCTURE

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

- Planned range:
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
- ...
```

Never include:

- passwords;
- active JWTs;
- private keys;
- production credentials;
- raw confidential documents;
- real personal data.

---

# 19. TEST CASE OWNERSHIP

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

# 20. AGENT PROHIBITIONS

The agent must not:

- create more than one branch per phase;
- push before explicit approval;
- create a PR before explicit approval;
- merge before explicit approval;
- start the next phase before explicit approval;
- collapse the ten services;
- bypass Permission Service;
- let ADMIN access document content;
- retain VIEW after expiration;
- rely only on the expiration scheduler;
- let delegated grants exceed parent permissions or time;
- store raw documents in PostgreSQL;
- expose MinIO object keys;
- log secrets or raw sensitive data;
- access another service's database;
- create cross-service foreign keys;
- remove tests to obtain green CI;
- commit `.env` or private keys;
- fabricate evidence;
- change authorship;
- rewrite Git history without explicit instruction;
- add Performance/Scoring before the core release is complete.

---

# 21. FINAL RELEASE CHECKLIST

## Architecture

- [ ] Ten independent NestJS servers.
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
- [ ] ADMIN content hard-deny.
- [ ] Task hierarchy.
- [ ] Secure file pipeline.
- [ ] Audit allow and deny.
- [ ] Security alerts.
- [ ] Records and transfer packages.
- [ ] Controlled disposal.

## Git control

- [ ] Four phase branches only.
- [ ] Three meaningful commits per phase.
- [ ] No unauthorized push.
- [ ] No unauthorized PR.
- [ ] No unauthorized merge.
- [ ] Human approval at every stop point.
- [ ] Real authorship.
- [ ] Real evidence.
- [ ] Weekly report contains actual hashes and links.

---

# 22. FINAL AGENT COMMAND

The initial instruction to the agent should be:

```text
Read C17_BACKEND_AI_AGENT_PLAN_ENGLISH_V2.md completely.

Implement only Phase 1 on the single local branch:
phase/01-foundation-auth-permission

Create the three Phase 1 commits described in the plan.
Run every required check.
Do not push.
Do not create a Pull Request.
Do not merge.
Do not create the Phase 2 branch.

At completion, print the required PHASE STOP REPORT and wait for my decision.
```
