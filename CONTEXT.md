# Task Assignment and Secure Document Sharing

An organizational platform where work is assigned as tasks, and access to confidential
documents is granted only for as long as the task that justifies it remains live.
Two ideas define the domain: authority over the system is separated from access to
content, and every grant of access carries an expiry it cannot outlive.

## Language

### People and authority

**ADMIN**:
A system role that governs users, roles, capabilities, policies, and alerts. Holds
authority over the platform but never over content — an ADMIN can neither read
document content nor join a task.
_Avoid_: administrator, superuser, root

**EMPLOYEE**:
A system role that performs work. The only role that can hold document access or
participate in a task.
_Avoid_: user, member, staff

**Participant**:
A person authorized on a task as its Creator, its current Assignee, or an explicitly
assigned participant. Participation is held on one specific task, confers the right to read
that task's Comment thread, and does not extend to its parent, children, or siblings. A
mention or subscription is not participation and grants nothing. An ADMIN can never become
a Participant.
_Avoid_: watcher, collaborator, stakeholder

**Ancestor Oversight**:
The narrow right of a task's Creator or current Assignee to see a summary — title, status,
assignee, deadline, overdue, result — of tasks beneath it in the hierarchy. It reveals
whether descendant work is on track and nothing more: never their Comments, never their
Documents.
_Avoid_: manager view, rollup, drill-down

**Mention**:
A notification routing marker naming a Participant in a Comment. Purely a delivery
concern — it never creates access, and a user who lacks task access cannot be mentioned.
_Avoid_: tag, at-mention, callout

**Subscription**:
A standing request to be notified about a task, available only to those who already have
task access. Like a Mention, it confers no access of its own.
_Avoid_: watch, follow, subscriber

**Creator**:
The Participant who raised a task and who reviews its result. For a Child Task, this is
the direct Participant of the parent who raised it.
_Avoid_: owner, requester, author

**Assignee**:
The Participant accountable for completing a task.
_Avoid_: owner, worker, responsible party

### Work

**Task**:
A unit of assigned work with a deadline, a lifecycle, a Creator, and an Assignee. A task
is the justification for document access — grants derive from it and expire with it.
_Avoid_: ticket, issue, job, work item

**Child Task**:
A task raised by a direct Participant of another task, who thereby becomes the Child
Task's Creator and reviewer. Every Child Task blocks its parent's approval — there are
no optional children.
_Avoid_: subtask, sub-task, dependent task

**Comment**:
A message on a task, readable only by that task's Participants. Treated as confidential
because it is where the substance of a document is quoted in practice.
_Avoid_: note, message, discussion, remark

**Capability**:
A finely-grained right held by an EMPLOYEE and administered by an ADMIN, used where the
two system roles are too coarse — notably ARCHIVE_RECEIVE, which makes its holder the
Archivist. A capability conferring content-adjacent authority can never be held by an
ADMIN account.
_Avoid_: privilege, scope, claim

**Archivist**:
An EMPLOYEE holding the ARCHIVE_RECEIVE capability, who checks and then accepts or
rejects a submitted Transfer Package. Not a system role.
_Avoid_: receiver, records officer

**Task Activity**:
The append-only history of what happened to a task — transitions, submissions, comments.
Progress is read from this history rather than stored as a number. Distinct from the
Audit Trail, which records the same events for evidence rather than for display.
_Avoid_: history, timeline, changelog, progress

**Overdue**:
A derived condition, true when a task's deadline has passed and it is not yet resolved.
Computed on read, never stored, never transitioned into.
_Avoid_: late, expired, OVERDUE status

**Blocked**:
A deliberate, person-entered condition on a task, carrying a reason and the status to
return to. Unlike Overdue, this is real stored state.
_Avoid_: stalled, on hold, paused

### Documents and access

**Document**:
An owned, classified, versioned artifact. Only ciphertext is ever stored; the raw bytes
exist only transiently during the Security Pipeline.
_Avoid_: file, attachment, record

**Security Level**:
A Document's internal classification — PUBLIC, INTERNAL, CONFIDENTIAL, or RESTRICTED.
State-secret material has no level because it is rejected at upload and never becomes a
Document.
_Avoid_: classification, sensitivity, clearance

**Security Pipeline**:
The one-way path every uploaded file takes before it becomes a Document: scan, checksum,
encrypt, sign, store. A file that fails any stage never becomes a Document.
_Avoid_: ingest, processing, upload flow

**Grant**:
A time-bounded award of specific permissions over one Document to one person, always
justified by a task. There is no way to hold document access without a Grant, and no
Grant without a task.
_Avoid_: share, permission, access, ACL

**Effective Expiry**:
The moment a Grant actually dies — the earliest of its own expiry, its task's deadline,
and its parent Grant's Effective Expiry. Fixed when the Grant is created; extending a
task deadline never pushes it out.
_Avoid_: expiry, TTL, valid until

**Delegation**:
Creating a Grant from a Grant. The child can never carry permissions its parent lacks,
nor outlive its parent's Effective Expiry, and dies when its parent is revoked.
_Avoid_: re-share, sub-grant, forward

**Revocation**:
The withdrawal of a Grant, whether deliberate or by reaching Effective Expiry. It removes
every permission at once — no residual read access survives it — and cascades to all
descendants.
_Avoid_: expiry, removal, cancellation

### Evidence and archive

**Audit Trail**:
The append-only, hash-chained record of every allow and deny decision. Written by exactly
one writer so the chain cannot fork. It is evidence, not a query surface.
_Avoid_: log, history, journal

**Record**:
A closed collection of Document versions, assembled for archival transfer.
_Avoid_: folder, case, bundle

**Transfer Package**:
A sealed, signed Record submitted for archival, carrying its manifest, metadata,
checksums, audit references, and handover receipt.
_Avoid_: archive, export, submission

**Disposal**:
The policy-approved destruction of stored Document content after its retention period.
The Audit Trail survives it — disposal removes content, never evidence.
_Avoid_: deletion, purge, removal
