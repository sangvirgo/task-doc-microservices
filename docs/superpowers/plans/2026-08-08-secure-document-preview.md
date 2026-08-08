# Secure Document Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a permission-gated, server-rendered document preview for every accepted upload format, with multiple burned-in watermarks and no original-file response to preview-only users.

**Architecture:** Document Management owns authenticated preview sessions, permission checks, audit events, and gateway-facing routes. Document Security owns decryption, MIME sniffing, conversion, and server-side watermark rendering; its preview route is internal-only. The web client receives short-lived page images, never a source PDF/Office blob.

**Tech Stack:** NestJS 11, TypeScript, Prisma/PostgreSQL, Jest/Supertest, Next.js/React/TypeScript, existing API Gateway and permission/audit/security clients, private MinIO storage, `sharp` plus controlled native converters for Office/PDF rendering.

---

## File map

Create these focused units:

- `backend/apps/document-security-service/src/security/preview/preview.types.ts` — preview request/result and renderer contracts.
- `backend/apps/document-security-service/src/security/preview/content-detector.ts` — magic-byte and UTF-8 content detection.
- `backend/apps/document-security-service/src/security/preview/watermark-composer.ts` — deterministic multi-layer watermark text/layout.
- `backend/apps/document-security-service/src/security/preview/preview-renderer.service.ts` — conversion orchestration, image sanitation, page pagination, and cleanup.
- `backend/apps/document-security-service/test/preview/content-detector.spec.ts` — detector unit tests.
- `backend/apps/document-security-service/test/preview/watermark-composer.spec.ts` — watermark unit tests.
- `backend/apps/document-security-service/test/preview/preview-renderer.service.spec.ts` — renderer cleanup and format routing tests.
- `backend/prisma/document-management-service/migrations/20260808120000_add_preview_sessions/migration.sql` — preview session table/indexes.
- `backend/apps/document-management-service/test/document-preview.integration.spec.ts` — gateway-facing preview authorization/response tests.
- `frontend/web/src/features/documents/document-preview.tsx` — page-image preview viewer.
- `frontend/web/tests/document-preview.test.tsx` — viewer behavior tests.

Modify these existing units:

- `backend/prisma/document-management-service/schema.prisma` — add `PreviewSession`.
- `backend/apps/document-security-service/src/security/security.controller.ts` — add internal preview routes.
- `backend/apps/document-security-service/src/security/security-pipeline.service.ts` — expose a safe source preparation boundary used by preview rendering.
- `backend/apps/document-security-service/src/app.module.ts` — register preview renderer/provider.
- `backend/apps/document-management-service/src/security/security.client.ts` — call internal preview endpoints.
- `backend/apps/document-management-service/src/documents/documents.service.ts` — persist/validate preview sessions and DTOs.
- `backend/apps/document-management-service/src/documents/documents.controller.ts` — add preview-session/page/revoke routes and capability response.
- `backend/apps/document-management-service/src/app.module.ts` — register preview service/provider if split from `DocumentsService`.
- `frontend/web/src/api/documents.ts` and `frontend/web/src/types/document.ts` — preview session/page contracts.
- `frontend/web/src/features/documents/document-detail.tsx` and `frontend/web/src/features/documents/documents.module.css` — replace metadata-only preview with viewer and deterrent controls.
- `backend/infra/Dockerfile` and `backend/package.json` — package the image/converter dependencies required by the selected renderer implementation.

## Task 1: Add detector and watermark contracts with failing tests

**Files:**

- Create: `backend/apps/document-security-service/src/security/preview/preview.types.ts`
- Create: `backend/apps/document-security-service/src/security/preview/content-detector.ts`
- Create: `backend/apps/document-security-service/src/security/preview/watermark-composer.ts`
- Test: `backend/apps/document-security-service/test/preview/content-detector.spec.ts`
- Test: `backend/apps/document-security-service/test/preview/watermark-composer.spec.ts`

- [ ] **Step 1: Write the detector tests first.** Cover PDF, PNG, JPEG, OLE/legacy DOC, OOXML/ZIP DOCX, valid UTF-8 text, and unknown binary. Assert that unknown binary returns `unsupported` rather than a fallback MIME.

```typescript
it('detects supported signatures and refuses unknown binary', () => {
  expect(detectPreviewFormat(Buffer.from('%PDF-1.7'))).toBe('pdf');
  expect(detectPreviewFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe('png');
  expect(detectPreviewFormat(Buffer.from([0xff, 0xd8, 0xff]))).toBe('jpeg');
  expect(detectPreviewFormat(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))).toBe('doc');
  expect(detectPreviewFormat(Buffer.from('PK\x03\x04[Content_Types].xml'))).toBe('docx');
  expect(detectPreviewFormat(Buffer.from('plain text\n'))).toBe('text');
  expect(detectPreviewFormat(Buffer.from([0x00, 0x9f, 0xff, 0x00]))).toBe('unsupported');
});
```

- [ ] **Step 2: Run the focused detector test and verify it fails because the detector does not exist.**

Run: `pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/document-security-service/test/preview/content-detector.spec.ts`

Expected: FAIL with the missing module/function error, not a test-environment error.

- [ ] **Step 3: Implement `detectPreviewFormat` and the format union.** Check signatures before UTF-8 validation; only return `text` when the bytes decode without NUL/control-binary evidence. Do not trust the uploaded MIME header.

- [ ] **Step 4: Write the watermark tests.** Assert the composed watermark contains actor email/ID, document ID, version, timestamp, session ID, page number, and the literal preview-only label. Assert page number changes the repeated layout seed.

```typescript
it('creates attributable multi-layer watermark content', () => {
  const result = composeWatermark({
    actorLabel: 'alice@example.test',
    documentId: 'doc-1',
    version: 2,
    sessionId: 'session-1',
    renderedAt: new Date('2026-08-08T10:00:00.000Z'),
    page: 3,
  });

  expect(result.text).toContain('PREVIEW ONLY');
  expect(result.text).toContain('alice@example.test');
  expect(result.text).toContain('doc-1');
  expect(result.text).toContain('v2');
  expect(result.text).toContain('session-1');
  expect(result.seed).not.toBe(composeWatermark({ ...result.input, page: 4 }).seed);
});
```

- [ ] **Step 5: Run the watermark test to verify the new test fails for the missing composer.**

- [ ] **Step 6: Implement the pure watermark composition contract.** Return text plus deterministic layout seed/opacity/rotation values; keep actual pixel compositing in the renderer so this unit remains dependency-free.

- [ ] **Step 7: Run both focused tests and verify they pass.**

- [ ] **Step 8: Commit the pure preview contracts.**

```bash
git add backend/apps/document-security-service/src/security/preview backend/apps/document-security-service/test/preview
git commit -m "feat: add secure preview detection and watermark contracts"
```

## Task 2: Implement server-side page rendering

**Files:**

- Create: `backend/apps/document-security-service/src/security/preview/preview-renderer.service.ts`
- Test: `backend/apps/document-security-service/test/preview/preview-renderer.service.spec.ts`
- Modify: `backend/package.json`
- Modify: `backend/infra/Dockerfile`

- [ ] **Step 1: Write renderer tests against injected command/image adapters.** Cover routing to PDF/image/text/DOCX handlers, page count, watermark invocation, unknown binary rejection, command timeout, and deletion of source/output temporary files after success and failure.

- [ ] **Step 2: Run the renderer tests and verify they fail because the service and adapters do not exist.**

- [ ] **Step 3: Implement `PreviewRenderer` with injected filesystem, command runner, and image compositor interfaces.** Use private temporary directories; copy/decrypt only into that directory; enforce the configured 25 MiB source limit, maximum 200 pages, maximum 2400px output dimension, and converter timeout. Never return the source path or source buffer.

- [ ] **Step 4: Implement format handlers.** Render PDF pages with `pdftocairo`/equivalent, convert DOC/DOCX to an isolated PDF through headless LibreOffice, paginate UTF-8 text into images, and sanitize PNG/JPEG through `sharp`. For every output page, composite the diagonal repeat, center identity, header/footer identity, per-page variation, and `PREVIEW ONLY — NO DOWNLOAD` label into the raster output.

- [ ] **Step 5: Add only the runtime dependencies needed by the renderer and install native tools in the service image.** Keep converter versions pinned and make the service fail closed if a converter is unavailable.

- [ ] **Step 6: Run the focused renderer tests and the document-security typecheck/build.** Fix implementation defects without weakening the tests.

- [ ] **Step 7: Commit the renderer.**

```bash
git add backend/apps/document-security-service backend/package.json backend/infra/Dockerfile
git commit -m "feat: render watermarked document preview pages"
```

## Task 3: Expose the internal security preview operation

**Files:**

- Modify: `backend/apps/document-security-service/src/security/security.controller.ts`
- Modify: `backend/apps/document-security-service/src/security/security-pipeline.service.ts`
- Modify: `backend/apps/document-security-service/src/app.module.ts`
- Modify: `backend/apps/document-management-service/src/security/security.client.ts`
- Test: `backend/apps/document-security-service/test/security-preview.integration.spec.ts`

- [ ] **Step 1: Write the failing controller/client tests.** Assert the internal route validates UUID/version/page/watermark fields, returns only `image/png` or `image/jpeg` bytes plus page metadata, and maps unsupported format/converter errors to `422`/`503`. Assert the client never follows a storage URL.

- [ ] **Step 2: Run the focused security preview test and verify the new route/client behavior fails.**

- [ ] **Step 3: Add `POST /security/:documentId/versions/:version/preview/prepare` and `GET /security/preview/:previewId/pages/:page` as internal-only routes.** The prepare route creates a short-lived internal render handle and returns page count/mime; the page route validates the handle and returns the watermarked image. Keep the route out of API Gateway modules.

- [ ] **Step 4: Wire `PreviewRenderer` to the existing verified decryption boundary.** Ensure plaintext temp files are deleted after render and that the existing download plaintext route remains unchanged.

- [ ] **Step 5: Run security-service unit/integration tests and build.**

- [ ] **Step 6: Commit the internal preview API.**

## Task 4: Add preview sessions and document-management authorization

**Files:**

- Modify: `backend/prisma/document-management-service/schema.prisma`
- Create: `backend/prisma/document-management-service/migrations/20260808120000_add_preview_sessions/migration.sql`
- Modify: `backend/apps/document-management-service/src/documents/documents.service.ts`
- Modify: `backend/apps/document-management-service/src/documents/documents.controller.ts`
- Modify: `backend/apps/document-management-service/src/app.module.ts`
- Modify: `backend/apps/document-management-service/src/security/security.client.ts`
- Test: `backend/apps/document-management-service/test/document-preview.integration.spec.ts`

- [ ] **Step 1: Add the Prisma model and migration first.** Use a UUID primary key, document/version/actor fields, `expires_at`, `revoked_at`, `last_used_at`, and `page_requests`. Add indexes for actor, document, and expiry. Do not add source bytes or storage keys.

- [ ] **Step 2: Write failing integration tests for preview-only behavior.** Cover session creation with `PREVIEW`, page response as image bytes, denial without `PREVIEW`, denial after revoke/expiry, denial for another actor or document/version, page-request limit, and denial of download-ticket creation for preview-only users.

- [ ] **Step 3: Run the integration test to verify the new endpoints fail.**

- [ ] **Step 4: Implement session persistence and validation in `DocumentsService`.** Use a 5-minute session TTL, a 200-page/session limit, one opaque UUID per session, and atomic increment/update of page requests. Return DTOs containing only session metadata and capability flags.

- [ ] **Step 5: Add controller routes.** On session creation, call `checkDocumentPermission(..., PREVIEW)` and the security client prepare operation. On each page, validate the session and repeat the current `PREVIEW` permission check before proxying the image. Add a revoke route and audit `DOCUMENT_PREVIEW_SESSION_CREATED`, `DOCUMENT_PREVIEW_PAGE_VIEWED`, `DOCUMENT_PREVIEW_REVOKED`, `DOCUMENT_PREVIEW_DENIED`, and `DOCUMENT_PREVIEW_FAILED` without source data.

- [ ] **Step 6: Set preview response headers.** Use `Cache-Control: private, no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`, and an image content type; never set `Content-Disposition: attachment` or expose a source filename/object key.

- [ ] **Step 7: Run the focused integration tests, migration validation, and document-management build.**

- [ ] **Step 8: Commit the permission-gated preview API.**

## Task 5: Build the web page-image viewer

**Files:**

- Modify: `frontend/web/src/types/document.ts`
- Modify: `frontend/web/src/api/documents.ts`
- Create: `frontend/web/src/features/documents/document-preview.tsx`
- Modify: `frontend/web/src/features/documents/document-detail.tsx`
- Modify: `frontend/web/src/features/documents/documents.module.css`
- Test: `frontend/web/tests/document-preview.test.tsx`

- [ ] **Step 1: Write failing component/API tests.** Assert the viewer starts a preview session, requests page images, does not call `redeem`, does not render a download/print control when `download` is false, shows the repeated watermark deterrent, and handles `403`, `422`, `429`, and `503` states.

- [ ] **Step 2: Run the focused frontend test and verify it fails because the viewer/contracts do not exist.**

- [ ] **Step 3: Add typed API methods.** Use `POST` for session creation, authenticated `GET` for page images, and `POST` revoke. Fetch page images as blobs only after the backend has returned a preview session; do not add a source-file fetch path.

- [ ] **Step 4: Implement `DocumentPreview` with incremental page loading and cleanup.** Render `<img>` elements using object URLs for watermarked pages, revoke object URLs on unmount, stop at `page_count`, and revoke the server session when the viewer closes. Add a CSS overlay only as a secondary deterrent.

- [ ] **Step 5: Update `DocumentDetail`.** Replace “Load safe preview metadata” with “Open preview”, pass backend capabilities, leave the existing authorized download flow intact, and hide/disable download/print for preview-only sessions.

- [ ] **Step 6: Run frontend tests, lint, and build.**

- [ ] **Step 7: Commit the web viewer.**

## Task 6: Full verification and security regression review

**Files:**

- Modify: existing tests only where the new API contract requires updated fixtures.
- Create: `docs/superpowers/reports/2026-08-08-secure-document-preview-verification.md`

- [ ] **Step 1: Run the complete focused backend tests for document security and document management.** Record exact pass/fail counts and any environment-dependent failures.

- [ ] **Step 2: Run frontend tests, backend lint/format checks, and both backend/frontend builds.**

- [ ] **Step 3: Run static leakage checks.** Verify preview responses/routes contain no `object_key`, direct storage URL, encrypted DEK, or source-file download path; verify the only original-byte response remains the `DOWNLOAD`-authorized redeem route.

- [ ] **Step 4: Exercise the permission matrix manually or with integration fixtures.** Confirm `PREVIEW` only can view all recognized accepted formats, `DOWNLOAD` is required for original bytes, and unknown binary never falls back to source streaming.

- [ ] **Step 5: Write the verification report with commands and observed output.** Do not claim completion until all required commands have fresh successful output.

- [ ] **Step 6: Request a code review against the secure-preview design and fix all Critical/Important findings before final handoff.**
