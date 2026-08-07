# DOCX and Multi-file Document Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `POST /documents/upload` accept DOCX files and multiple `file` parts while preserving the existing one-file response.

**Architecture:** Replace the single-file Multer interceptor with `FilesInterceptor('file')`, validate multipart metadata once, and process files sequentially through the existing `handleUploadedFile` pipeline. Return the legacy `UploadedDocumentResult` for one file and `{ items: UploadedDocumentResult[] }` for a batch; clean all unprocessed temporary files in the controller and keep per-file cleanup in the existing handler.

**Tech Stack:** NestJS, Multer via `@nestjs/platform-express`, TypeScript, Zod, Jest, Supertest, Prisma-backed integration tests.

---

### Task 1: Add failing DOCX and batch upload integration coverage

**Files:**
- Modify: `backend/apps/document-management-service/test/document-upload.integration.spec.ts`

- [ ] **Step 1: Add the DOCX MIME constant and a DOCX upload test**

Add this constant beside the existing test IDs:

```ts
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
```

Add this test after the existing single-file persistence test. The mock security service returns success for any accepted upload, so the test proves that the controller passes DOCX through to downstream processing rather than rejecting it as an unsupported MIME type:

```ts
it('accepts a DOCX upload through the security pipeline', async () => {
  const response = await request(app.getHttpServer())
    .post('/documents/upload')
    .set(authHeaders(EMPLOYEE_ID))
    .field('title', 'Word memo')
    .field('document_type', 'MEMO')
    .field('security_level', 'INTERNAL')
    .attach('file', Buffer.from('docx bytes!'), {
      filename: 'word-memo.docx',
      contentType: DOCX_MIME,
    })
    .expect(201);

  expect(response.body.document.title).toBe('Word memo');
  expect(
    fetchMock.mock.calls.some(([input, init]) => {
      const url = fetchUrl(input);
      if (!url.endsWith('/security/uploads/process')) return false;
      return new Headers(init?.headers).get('content-type') === DOCX_MIME;
    }),
  ).toBe(true);
});
```

- [ ] **Step 2: Add a two-file multipart test**

Add this test after the DOCX test:

```ts
it('processes multiple files sent under the file field and returns one item per document', async () => {
  const response = await request(app.getHttpServer())
    .post('/documents/upload')
    .set(authHeaders(EMPLOYEE_ID))
    .field('title', 'Batch upload')
    .field('document_type', 'MEMO')
    .field('security_level', 'INTERNAL')
    .attach('file', Buffer.from('hello world'), {
      filename: 'first.txt',
      contentType: 'text/plain',
    })
    .attach('file', Buffer.from('second doc'), {
      filename: 'second.txt',
      contentType: 'text/plain',
    })
    .expect(201);

  expect(response.body.items).toHaveLength(2);
  expect(response.body.items).toEqual([
    expect.objectContaining({
      document: expect.objectContaining({ title: 'Batch upload' }),
    }),
    expect.objectContaining({
      document: expect.objectContaining({ title: 'Batch upload' }),
    }),
  ]);
  expect(await prisma.document.count()).toBe(2);
  expect(await prisma.documentVersion.count()).toBe(2);
  expect(
    fetchMock.mock.calls.filter(([input]) => fetchUrl(input).endsWith('/security/uploads/process')),
  ).toHaveLength(2);
});
```

- [ ] **Step 3: Run the focused test before changing production code**

Run:

```bash
NODE_ENV=test pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/document-management-service/test/document-upload.integration.spec.ts
```

Expected: the new batch test fails with the current single-file behavior (`Too many files` or no `items` response), while the existing one-file tests remain green. This is the required RED checkpoint.

### Task 2: Implement multi-file request handling with backward-compatible responses

**Files:**
- Modify: `backend/apps/document-management-service/src/documents/documents.controller.ts:1-20, 100-200, 291-324`

- [ ] **Step 1: Switch the interceptor and uploaded parameter to an array**

Change the platform-express import to include `FilesInterceptor` and `UploadedFiles`, and define the file-count limit next to `MAX_UPLOAD_BYTES`:

```ts
import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
```

Preserve the existing import ordering/style used by the file; the key changes are `UploadedFiles` and `FilesInterceptor`.

Add:

```ts
const MAX_UPLOAD_FILES = Number(process.env.DOCUMENT_UPLOAD_MAX_FILES || 10);
```

Add the batch response type beside `UploadedDocumentResult`:

```ts
interface UploadedDocumentBatchResult {
  items: UploadedDocumentResult[];
}

type UploadDocumentsResponse = UploadedDocumentResult | UploadedDocumentBatchResult;
```

- [ ] **Step 2: Replace `FileInterceptor` with `FilesInterceptor` and process each file**

Replace the current upload method with this behavior:

```ts
@Post('upload')
@UseInterceptors(
  FilesInterceptor('file', MAX_UPLOAD_FILES, {
    dest: TMP_UPLOAD_DIR,
    limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_UPLOAD_FILES },
  }),
)
@ApiOperation({ summary: 'Upload one or more documents with streamed downstream processing' })
async uploadDocument(
  @UploadedFiles() files: UploadedFilePayload[] | undefined,
  @Body() body: Record<string, string>,
  @CurrentUser() user?: AuthContext,
): Promise<UploadDocumentsResponse> {
  if (!user) throw new ForbiddenException('Authentication required');
  if (isAdmin(user)) throw new ForbiddenException('ADMIN cannot upload documents');
  if (!files?.length) throw new BadRequestException('A file upload is required');

  const parsed = multipartUploadSchema.safeParse(body);
  if (!parsed.success) {
    await Promise.all(files.map((file) => safeDelete(file.path)));
    throw new BadRequestException(parsed.error.issues);
  }

  const results: UploadedDocumentResult[] = [];
  const unprocessedPaths = new Set(files.map((file) => file.path));

  try {
    for (const file of files) {
      results.push(
        await this.handleUploadedFile(
          {
            filePath: file.path,
            fileSize: file.size,
            mimeType: normalizeMimeType(file.mimetype),
            originalName: file.originalname,
          },
          { ...parsed.data, owner_id: user.userId },
          user,
        ),
      );
      unprocessedPaths.delete(file.path);
    }
  } finally {
    await Promise.all([...unprocessedPaths].map((filePath) => safeDelete(filePath)));
  }

  return files.length === 1 ? results[0] : { items: results };
}
```

The `finally` cleanup covers files that have not reached `handleUploadedFile` or whose processing fails before its own cleanup. Keep `handleUploadedFile` unchanged so its existing per-file cleanup remains authoritative for completed/active files.

- [ ] **Step 3: Run the focused test to verify GREEN**

Run the same command from Task 1, Step 3. Expected: the DOCX test, batch test, existing one-file tests, task attachment test, and downstream-failure cleanup test all pass.

### Task 3: Make DOCX and batch limits explicit in local configuration

**Files:**
- Modify: `backend/.env.example:28-31`

- [ ] **Step 1: Add the file-count setting**

Add:

```dotenv
DOCUMENT_UPLOAD_MAX_FILES=10
```

- [ ] **Step 2: Add DOCX to the example allowlist**

Replace the PDF/text-only example with the complete default list used by the controller:

```dotenv
DOCUMENT_ALLOWED_MIME_TYPES=application/pdf,text/plain,application/octet-stream,image/png,image/jpeg,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document
```

Custom deployments may still intentionally set a narrower list; the example now reflects the formats supported by the default service behavior.

### Task 4: Verify the changed service and preserve unrelated worktree changes

**Files:**
- Verify only: `backend/apps/document-management-service/src/documents/documents.controller.ts`
- Verify only: `backend/apps/document-management-service/test/document-upload.integration.spec.ts`
- Verify only: `backend/.env.example`

- [ ] **Step 1: Run the focused integration test again**

```bash
NODE_ENV=test pnpm --dir backend exec jest --config ./jest.config.ts --runInBand apps/document-management-service/test/document-upload.integration.spec.ts
```

Expected: all tests in the document upload integration suite pass.

- [ ] **Step 2: Run formatting and type/build checks**

```bash
pnpm backend:lint
pnpm --filter backend format:check
pnpm --dir backend build
```

Expected: lint, formatting, and backend build complete successfully.

- [ ] **Step 3: Review the diff scope**

```bash
git diff --check
git status --short
git diff -- backend/apps/document-management-service/src/documents/documents.controller.ts backend/apps/document-management-service/test/document-upload.integration.spec.ts backend/.env.example
```

Confirm that only the intended upload files contain implementation changes and that all pre-existing user modifications remain untouched.

- [ ] **Step 4: Commit the implementation**

```bash
git add backend/apps/document-management-service/src/documents/documents.controller.ts backend/apps/document-management-service/test/document-upload.integration.spec.ts backend/.env.example
git commit -m "feat: support docx and multi-file document uploads"
```
