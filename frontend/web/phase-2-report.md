# Web Phase Report

## Phase, branch, and role surface

Phase 2 — EMPLOYEE task and document work surface. The configured branch remains `feat/web-ui-taskdoc`; no commit was created. ADMIN content navigation remains excluded.

## Implemented routes and source-verified endpoints

- `/tasks`: list with canonical status filtering and create task (`GET`, `POST /api/tasks`).
- `/tasks/:id`: direct-participant detail or exact ancestor six-field summary. Direct views use participants, activity, comments, assign, add participant, lifecycle, block/unblock, submit, and review endpoints through the typed Gateway client only.
- Ancestor oversight makes no participant, activity, comment, document, upload, preview, or download request.
- `/documents`: metadata list, multipart `file` upload with XHR byte progress and metadata fields, plus documented list authorization gap.
- `/documents/:id`: permission-checked metadata, safe preview metadata, version list, and ticket request followed by exactly one redemption. Blob URLs are revoked after download dispatch.
- Ticket replay is represented as the source-observed 403. Duplicate participant remains 409; invalid lifecycle and rejected upload MIME/size are represented as 400 source behavior.

## Files changed and local commits

- `src/api/client.ts`, `src/api/tasks.ts`, `src/api/documents.ts`
- `src/types/task.ts`
- `src/features/tasks/task-list.tsx`, `src/features/tasks/task-detail.tsx`
- `src/features/documents/document-list.tsx`, `src/features/documents/document-detail.tsx`
- `tests/phase2-api-contracts.test.ts`
- `playwright.config.ts` now selects Playwright-managed Chromium and no longer references system Chrome.
- No local commit.

## Local verification

- lint: pass
- typecheck: pass
- unit/component tests: pass, 42 tests across 10 files
- coverage: pass; 51.80% statements, 46.49% branches, 43.52% functions, 65.69% lines
- build: pass
- managed-Chromium local browser checks: blocked. The Playwright browser cache has incomplete `chromium-1200` content and lacks both `chrome.exe` and `chromium_headless_shell-1200`. The browser suite correctly targets managed Chromium and fails before executing all four tests because that binary is absent. The CDN and redirected Google Storage object both returned HTTP 200, but `playwright install chromium` timed out after 10 minutes even after the stale `ms-playwright/__dirlock` was safely removed; the browser installer itself is stuck in this environment.

## Mock-only evidence and runtime verification deferred

Unit/component evidence and API contract tests are mock/static only. Docker/Gateway integration remains deferred because the stack cannot be brought up in this environment. No Gateway endpoint, server authorization behavior, secure upload pipeline, or ticket redemption was runtime-verified.

## Backend gaps and assumptions

- Document list, version-list, version-detail, and version-create lack equivalent controller permission checks. The UI does not claim this data is server-authorized and keeps its use conservative.
- No public retention/disposal Gateway route exists; no such UI was added.
- Submission review requires the backend submission ID, which is entered by the direct participant because task detail has no source-verified submission-list response in the current Phase 2 surface.

## Security and role-separation review

- All browser requests remain same-origin `/gateway/*` through the centralized client.
- No direct service port, `/internal/*`, `/api/security/*`, storage/object key, `localStorage`, or console logging use was found in Web source by static scan.
- Session behavior, 401 refresh, normalized safe errors, direct-participant-only comments, and ADMIN content-navigation exclusion remain in place.

## Required user approval for the next phase

Verdict: **not yet phase-gate ready for Phase 3**. The source/unit/build checks pass, but managed-Chromium verification is blocked by the missing headless-shell binary and the installation timeout. Restore the Playwright download/install path, rerun `corepack pnpm --filter @c17/web test:e2e` to a four-test managed-Chromium pass, then approve Phase 3 explicitly.
