import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { attachAuthContextFromHeaders } from '@c17/auth-context';
import { DocumentPrismaService } from '../src/prisma/document-prisma.service';

type MockFetch = typeof fetch & jest.MockedFunction<typeof fetch>;

const EMPLOYEE_ID = '10000000-0000-4000-8000-000000000001';
const TASK_ID = '20000000-0000-4000-8000-000000000001';
const PREVIEW_ID = '30000000-0000-4000-8000-000000000001';
const PAGE_BYTES = Buffer.from('watermarked-preview-page');

function authHeaders(userId = EMPLOYEE_ID): Record<string, string> {
  return {
    'x-user-id': userId,
    'x-user-role': 'EMPLOYEE',
    'x-correlation-id': randomUUID(),
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
}

describe('Document preview integration (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: DocumentPrismaService;
  let fetchMock: MockFetch;
  let previewAllowed = true;
  let downloadAllowed = false;
  let previewExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const auditEvents: Array<{ event_type?: string }> = [];

  beforeAll(async () => {
    process.env.MESSAGING_IN_MEMORY = 'true';
    fetchMock = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith('/internal/permissions/check')) {
        const body = JSON.parse(String(init?.body || '{}')) as { action?: string };
        const allowed = body.action === 'PREVIEW' ? previewAllowed : downloadAllowed;
        return jsonResponse(200, {
          allowed,
          reason_code: allowed ? null : 'MISSING_CAPABILITY',
          effective_expires_at: allowed ? '2026-08-08T12:00:00.000Z' : null,
        });
      }
      if (url.endsWith('/audit/events')) {
        auditEvents.push(JSON.parse(String(init?.body || '{}')) as { event_type?: string });
        return jsonResponse(201, { ok: true });
      }
      if (url.endsWith('/preview/prepare')) {
        return jsonResponse(201, {
          preview_id: PREVIEW_ID,
          page_count: 1,
          mime_type: 'image/png',
          expires_at: previewExpiresAt,
        });
      }
      if (url.includes('/security/preview/') && url.endsWith('/pages/1')) {
        return new Response(PAGE_BYTES, { status: 200, headers: { 'content-type': 'image/png' } });
      }
      if (url.includes('/security/preview/') && url.endsWith('/revoke')) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    global.fetch = fetchMock;

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(attachAuthContextFromHeaders);
    prisma = moduleRef.get(DocumentPrismaService);
    await app.init();
  });

  beforeEach(async () => {
    previewAllowed = true;
    downloadAllowed = false;
    previewExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    auditEvents.length = 0;
    fetchMock.mockClear();
    await prisma.previewSession.deleteMany();
    await prisma.downloadTicket.deleteMany();
    await prisma.documentVersion.deleteMany();
    await prisma.document.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets a PREVIEW-only user view watermarked page bytes but not download', async () => {
    const document = await createDocument(prisma);
    const session = await request(app.getHttpServer())
      .post(`/documents/${document.id}/versions/1/preview-session`)
      .set(authHeaders())
      .send({ task_id: TASK_ID })
      .expect(201);

    expect(session.body.capabilities).toEqual({ preview: true, download: false });
    expect(session.body).not.toHaveProperty('security_preview_id');

    const page = await request(app.getHttpServer())
      .get(`/documents/${document.id}/versions/1/preview-session/${session.body.id}/pages/1`)
      .set(authHeaders())
      .expect(200);
    expect(page.headers['content-type']).toContain('image/png');
    expect(Buffer.from(page.body)).toEqual(PAGE_BYTES);

    await request(app.getHttpServer())
      .post(`/documents/${document.id}/download-ticket`)
      .set(authHeaders())
      .send({ task_id: TASK_ID, version: 1 })
      .expect(403);

    expect(auditEvents.map((event) => event.event_type)).toEqual(
      expect.arrayContaining(['DOCUMENT_PREVIEW_SESSION_CREATED', 'DOCUMENT_PREVIEW_PAGE_VIEWED']),
    );
  });

  it('re-checks PREVIEW permission for every page request', async () => {
    const document = await createDocument(prisma);
    const session = await request(app.getHttpServer())
      .post(`/documents/${document.id}/versions/1/preview-session`)
      .set(authHeaders())
      .send({})
      .expect(201);

    previewAllowed = false;
    await request(app.getHttpServer())
      .get(`/documents/${document.id}/versions/1/preview-session/${session.body.id}/pages/1`)
      .set(authHeaders())
      .expect(403);
  });

  it('revokes the internal renderer handle and database session', async () => {
    const document = await createDocument(prisma);
    const session = await request(app.getHttpServer())
      .post(`/documents/${document.id}/versions/1/preview-session`)
      .set(authHeaders())
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/documents/${document.id}/versions/1/preview-session/${session.body.id}/revoke`)
      .set(authHeaders())
      .expect(204);

    await request(app.getHttpServer())
      .get(`/documents/${document.id}/versions/1/preview-session/${session.body.id}/pages/1`)
      .set(authHeaders())
      .expect(403);
  });
});

async function createDocument(prisma: DocumentPrismaService) {
  const document = await prisma.document.create({
    data: {
      title: 'Preview document',
      document_type: 'MEMO',
      owner_id: EMPLOYEE_ID,
      creator_id: EMPLOYEE_ID,
    },
  });
  await prisma.documentVersion.create({
    data: {
      document_id: document.id,
      version: 1,
      object_key: 'private/object/1',
      checksum: 'checksum-1',
      encrypted_dek: 'encrypted-dek-1',
      file_size: 25,
      mime_type: 'text/plain',
      created_by: EMPLOYEE_ID,
    },
  });
  return document;
}
