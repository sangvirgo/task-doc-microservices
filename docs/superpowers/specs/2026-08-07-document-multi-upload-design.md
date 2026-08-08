# DOCX and Multi-file Document Upload Design

## Goal

Allow the document multipart endpoint to accept Microsoft Word `.docx` files and multiple files in one request, while preserving the existing response contract for one-file clients.

## Current behavior

- `POST /documents/upload` uses `FileInterceptor('file')` with `files: 1`.
- A second multipart part named `file` is rejected by Multer as `Too many files`.
- The default MIME allowlist already contains `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, but the backend environment example does not include it.
- A single upload creates one document and version, optionally attaches that document to a task, and optionally creates task-scoped grants.

## Selected design

### Request handling

Change the multipart interceptor to accept an array of files under the existing `file` field. Use a configurable maximum file count:

```text
DOCUMENT_UPLOAD_MAX_FILES, default 10
```

The existing per-file limit remains in force at `DOCUMENT_UPLOAD_MAX_BYTES` (default 25 MiB). The endpoint will reject an empty request and requests over the file-count limit.

The multipart metadata is parsed once. The same metadata, task context, and grants apply to every file in the request. Files are processed sequentially so downstream security processing and task attachment remain bounded and deterministic.

### Response compatibility

- One uploaded file: return the existing `UploadedDocumentResult` object unchanged.
- Two or more uploaded files: return `{ items: UploadedDocumentResult[] }`.

Each item contains its own document, version, and optional task association/grants. Existing one-file consumers therefore continue to work without a response migration, while Postman and new clients can inspect every result in a batch.

If a later file fails validation or downstream processing, the request fails with the existing error behavior. Documents already completed earlier in the same request are not retroactively removed; this is explicitly a sequential batch operation rather than a cross-service transaction.

### DOCX acceptance

Keep the default allowlist entry for:

```text
application/vnd.openxmlformats-officedocument.wordprocessingml.document
```

Update `backend/.env.example` so a local deployment that copies the example does not replace the default list with a PDF/text-only list. Custom `DOCUMENT_ALLOWED_MIME_TYPES` values remain authoritative, allowing deployments to intentionally restrict formats.

### Cleanup and security

Every Multer temporary file is deleted in a `finally` path, including files that fail MIME, state-secret, security-pipeline, database, or task-attachment processing. Each file continues through the existing ClamAV, encryption, MinIO, and document persistence pipeline; multi-file support does not bypass any security step.

## Testing

Extend the document upload integration coverage to prove:

1. A `.docx` MIME type is accepted and persists a document/version.
2. Two files with the same `file` field are both processed and return two items.
3. Existing one-file upload and task attachment response shapes remain unchanged.
4. Temporary files are cleaned when downstream processing fails.

The targeted integration test suite will be run first, followed by the document-management service build/typecheck and the relevant backend verification command.
