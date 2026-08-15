# Confidentiality is gated by participation, and ADMIN can never participate

Task Comments are readable only by a task's authorized participants rather than by role.
Comment threads are where the substance of a RESTRICTED document actually gets quoted, so
they need the same protection as document content, but the plan's ADMIN content hard-deny
(§5.2) covered only documents and left comments open.

Authorization is per-task and deny-by-default. Direct participants — the task creator, the
current assignee, and explicitly assigned participants — may read that task's full detail,
comments, submissions, and activity. Authorization does not propagate along the hierarchy
except for one narrow case: the creator and current assignee of an ancestor task may read a
six-field summary of any descendant (title, status, assignee, deadline, is_overdue,
completion result). That oversight grants nothing further — descendant comments still
require direct participation in the descendant, and descendant documents still require
their own Grant. Nothing propagates upward or sideways: a descendant participant cannot
read the parent's comments or documents, and no participant can read a sibling task.

A mention, a subscription, or being a notification recipient confers **no** access
by itself — these are delivery concerns, not authorization concerns. A user may be
mentioned or subscribed only if they already hold legitimate access, and an attempt to
mention someone who lacks it is rejected rather than silently granting it. Otherwise the
weakest write path in the system would become a way to hand out read access to
confidential content.

Gating on participation alone would have been worse than the role rule it replaced: an
ADMIN administers users and roles, so they could self-assign a task or add themselves as a
participant and then read the thread entirely legitimately. So participation is gated in
turn — an account holding ADMIN can never become a participant by any route, and Permission
Service rejects the attempt. The same reasoning applies to Capabilities: an ADMIN cannot
hold a capability that confers content-adjacent authority, such as ARCHIVE_RECEIVE, because
ADMINs are the ones who grant capabilities.

## Consequences

- The general rule is that ADMIN holds authority over the platform and never over content,
  and any new content-adjacent right must be tested against it. All three escalation paths
  found so far — participation, mentions, and capabilities — came from granting authority
  through a mechanism the grantee administers or can trigger.
- Ancestor oversight is a summary projection, not a relaxed permission. An endpoint serving
  it must project the six fields explicitly; reusing the full task-detail serializer would
  silently leak descendant detail to someone who is not a direct participant. This is the
  most likely way the rule gets broken in practice.
- Oversight belongs to the ancestor's creator and current assignee only, not to its
  explicitly assigned participants — so being added to a task does not let you see down the
  tree beneath it.
- An organization where the same person must both administer the system and do task work
  needs two accounts. This is intended.
