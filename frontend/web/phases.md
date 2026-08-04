# C17 Web delivery roadmap

This roadmap is derived from the static backend audit in [backend-frontend-contract-audit.md](backend-frontend-contract-audit.md). It governs only `frontend/web/` on `feat/web-ui-taskdoc`.

## Verification policy

Docker infrastructure image pulls currently fail with EOF errors from the registry. Docker backend, public-Gateway fixtures, and container integration are deliberately **not required** for this roadmap until the environment is repaired.

Each phase must still run the applicable local checks: lint, typecheck, unit/component tests, coverage, build, and local browser tests when managed Chromium is available. Mock results are labelled mock-only; they do not prove backend runtime authorization or contract behavior.

## Role and scope boundary

| Surface | Intended UI audience | Backend status | Web rule |
|---|---|---|---|
| Tasks, Comments, Documents, Grants | EMPLOYEE | Task/document permissions partly enforced | never show in ADMIN navigation |
| Notifications | authenticated user | ownership check gap | use caller identity for UX; report gap |
| Users, capabilities, monitoring, audit metadata | ADMIN | several controller role gaps | ADMIN UX guard only; never claim server enforcement |
| Records, Transfer Packages | EMPLOYEE with server/capability result | service has custody checks | hide from ADMIN; reconcile server result |
| Retention/Disposal | no Web UI | controller exists but Gateway has no public route | deferred; frontend-only work cannot unblock it |

---

## Phase 0 — contract audit and implementation plan

**Purpose:** Establish the source-verified Web boundary before feature code.

1. Read current Web source, Gateway route table, owning backend controllers/services/contracts/schemas/tests.
2. Maintain endpoint matrix, DTO map, role matrix, status-code map, and backend gap register in `backend-frontend-contract-audit.md`.
3. Confirm the user-approved route/module plan before adding new Web features.

**Stop:** Report audit changes and ask for scope approval. No backend change is implied.

---

## Phase 1 — foundation and authenticated shell

**Status:** implemented; maintain rather than re-scaffold.

1. App Router shell, same-origin Gateway rewrite, centralized client, normalized errors/correlation IDs.
2. One sessionStorage record, serialized refresh rotation, logout/401 cleanup, protected-route UX.
3. Desktop/tablet light-theme shell, common states, accessibility baseline, ADMIN content-navigation exclusion.
4. Replace the temporary system-browser fallback with managed Chromium when possible; do not claim it has been verified before then.

**Stop:** Run local checks and update the phase report with actual results.

---

## Phase 2 — EMPLOYEE task and document work surface

1. Task list/detail/filter/create/assign/participants/lifecycle/block/activity/submission/review.
2. Direct-participant Comment list/create. Ancestor Oversight is exact summary-only and makes no request for participant/activity/comment/document data.
3. Document metadata list/detail/preview/version list, multipart upload with progress and cleanup, ticket request then exactly one redeem, Blob URL cleanup.
4. Display safe error/retry states. Use source behavior: duplicate participant is 409; invalid task workflow and upload MIME/size validation are currently 400; ticket replay is currently 403.
5. Document-list/version authorization is a backend gap. Do not present it as permission-verified or broaden its data use.

**Local test gate:** client error normalization for 401/403/404/409/413/415/429/503; direct vs ancestor request policy; ticket single-use handling; no sensitive DOM/network/log exposure; responsive keyboard behavior.

**Stop:** Report completed routes, mock/static evidence, source gaps, and unverified runtime behavior.

---

## Phase 3 — EMPLOYEE grants and notifications

1. Grants list/detail/create/delegate/revoke with server-result reconciliation. Explain returned expiry only; never calculate authority locally.
2. Notifications list/read/read-all/preferences; no realtime, push, email-delivery, or offline claim.
3. Use JWT `sub` only as a UX identity hint where required. Do not accept a route’s caller-supplied actor/recipient field as trusted client authorization.
4. Keep a visible/reportable gap for absent controller ownership checks on grant/notification APIs.

**Local test gate:** success/loading/empty/retry/error states, server-denied behavior, expiry/revocation display, and no sensitive data leakage.

**Stop:** Report all authorization gaps and request approval before any backend-contract assumption is relied upon.

---

## Phase 4 — ADMIN administration and monitoring

1. ADMIN-only UX routes for user listing/detail/create/lock/unlock/capability changes.
2. ADMIN-only UX routes for monitoring alerts/rules and their resolution/toggle/create operations.
3. Audit metadata may be added only as a metadata surface after a safe-field review; never build an audit content viewer or audit-event writer.
4. Keep Tasks, Comments, Documents, Grants, Records, and Transfer Packages absent from ADMIN navigation and route UX.
5. Current backend controllers do not consistently enforce ADMIN or ownership. Mark every such screen as client UX guard plus backend-gap pending; never assert security from the hidden route alone.

**Local test gate:** ADMIN/EMPLOYEE route UX separation, denied server responses, sensitive-field redaction, keyboard/tablet behavior.

**Stop:** Report backend authorization gaps prominently.

---

## Phase 5 — EMPLOYEE records and archival custody

1. Records list/create/detail/entry/seal.
2. Transfer Packages list/detail/create/submit/receive/accept/reject/archive.
3. Present ARCHIVE_SUBMIT/ARCHIVE_RECEIVE as backend-result-dependent UX. Enforce confirmation and separation-of-duties presentation: a submitter cannot receive or decide their own package.
4. No ADMIN custody UI.

**Local test gate:** state progression, confirmation, self-custody denial handling, capability/role presentation, and sensitive data review.

**Stop:** Report which rules have source evidence versus only mocked client evidence.

---

## Phase 6 — Web hardening and release evidence

1. Complete accessible loading/empty/error/retry/not-found boundaries, focus order, responsive desktop/tablet layouts, and destructive confirmations.
2. Review every client module for service-port/internal/security calls, persistent sensitive state, raw errors, token/ticket/object-key/storage leakage, and unreleased Blob URLs.
3. Run the full local suite and document exact command results, coverage, skipped tests, and browser status.
4. Docker/Gateway integration is deferred, not waived: list it as an external runtime-validation follow-up until the image-pull environment works.

## Phase report template

```md
# Web Phase Report

## Phase, branch, and role surface

## Implemented routes and source-verified endpoints

## Files changed and local commits

## Local verification
- lint:
- typecheck:
- unit/component tests:
- coverage:
- managed-Chromium local browser checks:
- build:

## Mock-only evidence and runtime verification deferred

## Backend gaps and assumptions

## Security and role-separation review

## Required user approval for the next phase
```
