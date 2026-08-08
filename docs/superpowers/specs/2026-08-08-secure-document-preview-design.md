# Secure Document Preview Design

**Date:** 2026-08-08

## Objective

Allow users who have `PREVIEW` permission to view every document type currently accepted by the upload flow, while minimizing the ability to retrieve the original file. Users with only `PREVIEW` must never receive the original PDF, DOC/DOCX, image, text, or binary upload from the preview flow.

This design does not promise absolute protection against screenshots, cameras, screen capture, or a determined user controlling their own device. It makes the browser receive only a short-lived, server-rendered preview and adds visible attribution to discourage sharing and support investigation.

## Current upload formats

The default `DOCUMENT_ALLOWED_MIME_TYPES` set currently accepts:

- `application/pdf`
- `text/plain`
- `image/png`
- `image/jpeg`
- `application/msword`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `application/octet-stream`

The implementation must preserve this upload contract. Preview rendering must inspect file content rather than trusting a client-provided MIME type. For `application/octet-stream`, the renderer detects PDF, PNG, JPEG, legacy DOC, OOXML DOCX, or UTF-8 text by file signature/content. An unrecognized binary file returns a safe preview-unavailable response and is never sent to the browser.

## Non-goals

- Absolute prevention of screenshots or camera capture.
- Replacing the existing permission service or download-ticket workflow.
- Exposing a browser-readable PDF/Office source and attempting to secure it with CSS alone.
- Adding a general-purpose editing or annotation workflow.

## Security requirements

1. The original object key, storage URL, encrypted DEK, plaintext source bytes, and converter paths must remain server-side.
2. Preview session creation requires authenticated `PREVIEW` permission for the requested document/version.
3. Every preview page request validates the session owner, document, version, expiry, and current `PREVIEW` permission. Revocation must take effect on the next request.
4. Preview sessions are opaque, short-lived, and bound to the authenticated actor. Sharing a page URL without the actor's authenticated session must fail.
5. Preview responses use `Cache-Control: private, no-store`, do not set an attachment filename, and are served as rendered image bytes only.
6. The existing download endpoints remain independently gated by `DOWNLOAD`; a preview session cannot be redeemed as a download ticket.
7. Conversion runs with bounded input size, execution time, output dimensions/page count, and temporary-file cleanup in `finally` blocks. Conversion failure never falls back to streaming the source.
8. Access denials, session creation, page rendering, expiry, and conversion failures produce audit events without storing plaintext, DEKs, storage credentials, or full document contents.

## Recommended architecture

### 1. Document Management service

Add a focused preview orchestration boundary:

- `PreviewService`: creates and validates preview sessions, checks expiry/ownership, calls the security service, and returns plain preview DTOs.
- `PreviewController`: exposes the authenticated gateway routes and contains only HTTP concerns.
- `PreviewSession` persistence: stores an opaque session ID, document ID, version, actor ID, expiry, revocation/last-used timestamps, and a bounded page-request counter. It does not store document bytes.

Proposed routes:

```text
POST /documents/:documentId/versions/:version/preview-session
GET  /documents/:documentId/versions/:version/preview-session/:sessionId/pages/:page
POST /documents/:documentId/versions/:version/preview-session/:sessionId/revoke
```

The create response contains only preview metadata, for example:

```json
{
  "session_id": "opaque-id",
  "document_id": "...",
  "version": 1,
  "mime_type": "application/pdf",
  "page_count": 4,
  "expires_at": "...",
  "capabilities": { "preview": true, "download": false }
}
```

The page route proxies a rendered `image/png` or `image/jpeg` response from the security service. It must not expose an object key or a source MIME response. The download-ticket route continues to require `DOWNLOAD` and remains the only supported path for downloading the original.

### 2. Document Security service

Keep decryption and object-storage access inside the existing security service. Add an internal-only preview operation that:

1. Verifies the requested document/version exists and is clean/servable.
2. Materializes the decrypted source only in a protected temporary location.
3. Detects the actual content type.
4. Converts the source into page images.
5. Burns the user-specific watermark into each page image.
6. Returns page count and rendered page bytes to Document Management.
7. Deletes all temporary source and output files after the response/cache lifetime.

The conversion layer should be behind a `PreviewRenderer` interface so MIME-specific converters can be tested without requiring native binaries in unit tests:

- PDF: render every page to an image.
- PNG/JPEG: sanitize and render as a single page, preserving an appropriate maximum dimension.
- TXT: paginate UTF-8 text into non-selectable page images with bounded line/character counts.
- DOC/DOCX: convert to PDF in a restricted headless conversion process, then render pages to images.
- `application/octet-stream`: detect one of the supported formats above; otherwise return `PREVIEW_UNAVAILABLE` without returning bytes.

The internal security-service route must not be published through the API Gateway.

### 3. Watermark composition

Watermarking is server-side and therefore remains present even if the user disables JavaScript or removes CSS from the page. Each rendered page receives several layers:

- Repeating diagonal pattern across the full page at low opacity.
- A more legible center watermark with the authenticated user's email/ID.
- Header and footer attribution containing document ID, version, timestamp, and preview session ID.
- A per-page variation in position/rotation/opacity so a cropped screenshot still carries attribution.
- A visible “PREVIEW ONLY — NO DOWNLOAD” label.

The frontend may add an additional overlay and disable copy/print/context-menu controls as a usability deterrent, but these are not security controls.

### 4. Web frontend

Replace the current metadata-only preview action with a page-image viewer:

- Start a preview session on explicit preview request.
- Display page images incrementally, never as a source PDF/blob.
- Show loading, unsupported-format, expired-session, permission-denied, and conversion-error states.
- Hide/disable download and print actions when `capabilities.download` is false.
- Revoke the session when the viewer closes and stop requesting pages after expiry.
- Keep the existing download flow unchanged for users whose backend capability is `DOWNLOAD`.

The frontend must not treat the hidden button or disabled state as authorization. The backend remains authoritative.

## Data flow

```text
Browser
  │ authenticated request
  ▼
API Gateway → Document Management
                │ check PREVIEW + create short-lived session
                ▼
             Document Security
                │ decrypt privately → detect/convert → watermark
                ▼
             Document Management → image bytes only → Browser
```

At no point does the browser receive the original source, a direct storage URL, or a reusable download ticket from the preview path.

## Error handling

- `401`: no authenticated user.
- `403`: missing/revoked/expired `PREVIEW`, wrong session owner, or expired session.
- `404`: document, version, or preview session does not exist.
- `422 PREVIEW_UNAVAILABLE`: unsupported or unrecognized binary format, malformed document, or converter rejection.
- `429`: page/session rate limit exceeded.
- `503`: renderer/security dependency unavailable; never fall back to original-file streaming.

All error responses use the existing gateway error shape and correlation ID behavior.

## Testing strategy

### Backend unit tests

- MIME sniffing recognizes every accepted format and rejects unknown binary content.
- Watermark composition includes all required actor/document/session fields and varies by page.
- Preview session expiry, ownership, document/version binding, revocation, and request limits work correctly.
- Renderer failures clean temporary files and never return source bytes.

### Backend integration tests

- A user with only `PREVIEW` can create a session and receive rendered image bytes.
- A preview-only user cannot create a download ticket or redeem a download ticket.
- A user without `PREVIEW` cannot create a session or request a page.
- Wrong actor, wrong document/version, expired session, revoked session, and over-limit requests are denied.
- Preview responses contain no object key, source filename, storage URL, or plaintext source content.
- Every currently accepted MIME type follows its expected renderer path; unknown `octet-stream` returns `PREVIEW_UNAVAILABLE`.

### Frontend tests

- Viewer requests a session and page images rather than the original file.
- Preview-only capability does not render download/print controls.
- Watermark overlay and “PREVIEW ONLY” state render correctly.
- Permission, expiry, unsupported-format, and retry states are visible.

## Operational safeguards

- Add renderer dependencies and explicit converter timeouts to the service image/configuration.
- Keep preview artifacts in private storage or protected temporary storage only; apply a short TTL and cleanup job if artifacts are persisted for reuse.
- Add per-user/document/session rate limits and maximum concurrent render jobs.
- Monitor conversion failures, unusual page-request volume, repeated denied downloads, and session sharing indicators.

## Acceptance criteria

The feature is complete when all accepted upload formats that can be safely identified render as watermarked page images, unknown binary uploads never leak their bytes, a `PREVIEW`-only user cannot obtain the original through any preview endpoint, and the existing `DOWNLOAD` ticket flow still works only for users with `DOWNLOAD` permission.
