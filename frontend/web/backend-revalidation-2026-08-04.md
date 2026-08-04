# Backend revalidation after main pull

This note supersedes only the stale findings below in the earlier frontend reports. It is a static source review of `9b82d99d`, not runtime evidence.

## Verified changes in the pulled backend

- The Gateway now exposes `/api/retention-disposal` and forwards it to document management. The Web route `/retention-disposal` uses this public Gateway path only.
- The Gateway blocks browser access to `/api/security`, permission internal checks, authentication internal controls, document-version processing, monitoring event ingestion, and audit-event append.
- The Gateway requires an ADMIN JWT role for `/api/users`, `/api/monitoring`, and `/api/audit` routes. The monitoring controller also now checks `isAdmin` for alerts and rules.
- Notification controller operations derive and verify the caller from forwarded identity headers. The Gateway additionally constrains employee notification list/read-all/preference requests to their own user ID.
- Document list, detail, version list, and version detail now receive `CurrentUser` and perform a PREVIEW permission decision per document/version. Browser version creation is internal-only at the Gateway.
- Record list/get/add-entry and transfer-package list/get now receive caller context. Transfer package reads require ADMIN or `ARCHIVE_RECEIVE`; mutations retain capability and separation-of-duties checks.
- Retention/Disposal is now available to EMPLOYEE callers. ADMIN is rejected. Disposal approval/execution require server-side `DISPOSAL_APPROVE` plus a document `DISPOSE` permission decision.

## Remaining limits and frontend decisions

- Audit read routes are ADMIN-gated at Gateway, but their DTO includes actor IDs, resource IDs, hashes and arbitrary payload. No audit viewer is added until fields/payload redaction are formally approved.
- Grants have controller-level caller derivation in the pulled code, but their full delegate/revoke ownership semantics still require live Gateway verification; the existing UI remains result-driven.
- Runtime validation is still blocked: Playwright Chromium is absent, and Docker Desktop's Linux daemon pipe is unavailable. Both were attempted twice on 2026-08-04.
- Static evidence does not prove upload, ticket redemption, authorization, retention execution, or custody behavior against a running stack.

## Web completion added in this revalidation

`/retention-disposal` adds hold list/place/release, approval list/create, eligibility check, and confirmed disposal execution. Every request uses `/gateway/retention-disposal/*`; capability and permission outcomes are left to the server.
