import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { mkdtempSync } from 'fs';
import { readdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import { attachAuthContextFromHeaders } from '@c17/auth-context';

import { DocumentPrismaService } from '../src/prisma/document-prisma.service';

type MockFetch = typeof fetch & jest.MockedFunction<typeof fetch>;

const EMPLOYEE_ID = '10000000-0000-4000-8000-000000000001';
const ASSIGNEE_ID = '10000000-0000-4000-8000-000000000002';
const TASK_ID = '10000000-0000-4000-a000-000000000003';
const GRANT_EXPIRY = '2026-08-10T17:00:00.000Z';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function authHeaders(userId: string): Record<string, string> {
  return {
    'x-user-id': userId,
    'x-user-role': 'EMPLOYEE',
    'x-user-capabilities': '[]',
    'x-correlation-id': '11111111-1111-4111-8111-111111111111',
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fetchUrl(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
}

describe('Document upload integration (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: DocumentPrismaService;
  let fetchMock: MockFetch;
  let uploadDir: string;

  beforeAll(async () => {
    process.env.MESSAGING_IN_MEMORY = 'true';
    uploadDir = mkdtempSync(join(tmpdir(), 'c17-document-upload-test-'));
    process.env.DOCUMENT_UPLOAD_TMP_DIR = uploadDir;

    const mockFetch: MockFetch = jest.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = fetchUrl(input);
      if (url.endsWith('/audit/events')) {
        return Promise.resolve(jsonResponse(201, { ok: true }));
      }

      if (url.includes('/tasks/internal/') && url.endsWith('/context')) {
        return Promise.resolve(
          jsonResponse(200, {
            task: {
              id: TASK_ID,
              creator_id: EMPLOYEE_ID,
              assignee_id: ASSIGNEE_ID,
              deadline: '2026-08-11T17:00:00.000Z',
            },
            participants: [
              { user_id: EMPLOYEE_ID, role: 'CREATOR' },
              { user_id: ASSIGNEE_ID, role: 'ASSIGNEE' },
            ],
          }),
        );
      }

      if (url.endsWith('/internal/grants/task-document')) {
        const rawBody = typeof init?.body === 'string' ? init.body : '{}';
        const body = JSON.parse(rawBody) as {
          actor_id: string;
          resource_id: string;
          task_id: string;
          permissions: string[];
          expires_at: string;
        };
        return Promise.resolve(
          jsonResponse(201, {
            id: '40000000-0000-4000-a000-000000000001',
            grantor_id: EMPLOYEE_ID,
            actor_id: body.actor_id,
            resource_type: 'DOCUMENT',
            resource_id: body.resource_id,
            permissions: body.permissions,
            task_id: body.task_id,
            expires_at: body.expires_at,
            effective_expires_at: body.expires_at,
            status: 'ACTIVE',
            revoked_at: null,
            parent_grant_id: null,
            created_at: '2026-08-05T12:00:00.000Z',
          }),
        );
      }

      if (url.endsWith('/security/uploads/process')) {
        return Promise.resolve(
          jsonResponse(201, {
            id: 'enc-1',
            document_id: '20000000-0000-4000-8000-000000000001',
            version: 1,
            object_key: 'pending/object/1',
            checksum: 'checksum-1',
            encrypted_dek: 'encrypted-dek-1',
            kek_version: 1,
            file_size: 11,
            mime_type: 'text/plain',
            scan_status: 'PENDING',
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
    });
    fetchMock = mockFetch;

    global.fetch = fetchMock;

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(attachAuthContextFromHeaders);
    prisma = moduleRef.get(DocumentPrismaService);
    await app.init();
  });

  beforeEach(async () => {
    fetchMock.mockClear();
    await prisma.downloadTicket.deleteMany();
    await prisma.taskDocument.deleteMany();
    await prisma.documentVersion.deleteMany();
    await prisma.document.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await rm(uploadDir, { recursive: true, force: true });
  });

  it('persists document metadata only after multipart downstream processing succeeds', async () => {
    const response = await request(app.getHttpServer())
      .post('/documents/upload')
      .set(authHeaders(EMPLOYEE_ID))
      .field('title', 'Quarterly memo')
      .field('document_type', 'MEMO')
      .field('owner_id', EMPLOYEE_ID)
      .field('security_level', 'INTERNAL')
      .attach('file', Buffer.from('hello world'), {
        filename: 'memo.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    expect(response.body.document.title).toBe('Quarterly memo');
    expect(response.body.version.version).toBe(1);
    expect(response.body).not.toHaveProperty('association');
    expect(response.body).not.toHaveProperty('grants');
    expect(response.body.version).not.toHaveProperty('object_key');

    const documents = await prisma.document.findMany();
    const versions = await prisma.documentVersion.findMany();
    expect(documents).toHaveLength(1);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.object_key).toBe('pending/object/1');
    expect(await prisma.taskDocument.count()).toBe(0);
  });

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
      fetchMock.mock.calls.filter(([input]) =>
        fetchUrl(input).endsWith('/security/uploads/process'),
      ),
    ).toHaveLength(2);
  });

  it('lists an independently uploaded document in the owner inventory before task attachment', async () => {
    const upload = await request(app.getHttpServer())
      .post('/documents/upload')
      .set(authHeaders(EMPLOYEE_ID))
      .field('title', 'Discoverable memo')
      .field('document_type', 'MEMO')
      .field('security_level', 'INTERNAL')
      .attach('file', Buffer.from('hello world'), {
        filename: 'discoverable-memo.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/documents?owner_id=${EMPLOYEE_ID}`)
      .set(authHeaders(EMPLOYEE_ID))
      .expect(200);

    expect(response.body.items).toEqual([
      expect.objectContaining({ id: upload.body.document.id, title: 'Discoverable memo' }),
    ]);
    expect(response.body.pagination).toMatchObject({ page: 1, page_size: 20, total: 1 });
  });

  it('uploads and attaches a document to a task when explicit task grants are supplied', async () => {
    const response = await request(app.getHttpServer())
      .post('/documents/upload')
      .set(authHeaders(EMPLOYEE_ID))
      .field('title', 'Task memo')
      .field('document_type', 'MEMO')
      .field('security_level', 'INTERNAL')
      .field('task_id', TASK_ID)
      .field(
        'grants',
        JSON.stringify([
          {
            actor_id: ASSIGNEE_ID,
            permissions: ['PREVIEW', 'DOWNLOAD'],
            expires_at: GRANT_EXPIRY,
          },
        ]),
      )
      .attach('file', Buffer.from('hello world'), {
        filename: 'task-memo.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    expect(response.body.document.id).toEqual(expect.any(String));
    expect(response.body.association).toMatchObject({
      task_id: TASK_ID,
      document_id: response.body.document.id,
      attached_by: EMPLOYEE_ID,
    });
    expect(response.body.grants).toEqual([
      expect.objectContaining({
        actor_id: ASSIGNEE_ID,
        resource_id: response.body.document.id,
        task_id: TASK_ID,
        permissions: ['PREVIEW', 'DOWNLOAD'],
      }),
    ]);

    await expect(
      prisma.taskDocument.findUnique({
        where: {
          task_id_document_id: { task_id: TASK_ID, document_id: response.body.document.id },
        },
      }),
    ).resolves.toMatchObject({ task_id: TASK_ID, document_id: response.body.document.id });
  });

  it('rejects task-context upload without explicit grants before security processing', async () => {
    await request(app.getHttpServer())
      .post('/documents/upload')
      .set(authHeaders(EMPLOYEE_ID))
      .field('title', 'Unshared task memo')
      .field('document_type', 'MEMO')
      .field('task_id', TASK_ID)
      .attach('file', Buffer.from('hello world'), {
        filename: 'task-memo.txt',
        contentType: 'text/plain',
      })
      .expect(400);

    expect(await prisma.document.count()).toBe(0);
    expect(await prisma.taskDocument.count()).toBe(0);
    expect(
      fetchMock.mock.calls.some(([input]) => fetchUrl(input).endsWith('/security/uploads/process')),
    ).toBe(false);
  });

  it('rejects declared state-secret material without creating a document row', async () => {
    const response = await request(app.getHttpServer())
      .post('/documents/upload')
      .set(authHeaders(EMPLOYEE_ID))
      .field('title', 'Restricted memo')
      .field('document_type', 'MEMO')
      .field('owner_id', EMPLOYEE_ID)
      .field('declared_state_secret', 'true')
      .attach('file', Buffer.from('hello world'), {
        filename: 'memo.txt',
        contentType: 'text/plain',
      })
      .expect(400);

    expect(response.body.message).toBe('Declared state-secret material is not accepted');
    expect(await prisma.document.count()).toBe(0);
    expect(
      fetchMock.mock.calls.some(([input]) => fetchUrl(input).endsWith('/security/uploads/process')),
    ).toBe(false);
  });

  it('cleans temporary plaintext when downstream processing fails', async () => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = fetchUrl(input);
      if (url.endsWith('/audit/events')) {
        return Promise.resolve(jsonResponse(201, { ok: true }));
      }

      if (url.endsWith('/security/uploads/process')) {
        return Promise.resolve(jsonResponse(503, { message: 'scanner unavailable' }));
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
    });

    await request(app.getHttpServer())
      .post('/documents/upload')
      .set(authHeaders(EMPLOYEE_ID))
      .field('title', 'Broken memo')
      .field('document_type', 'MEMO')
      .field('owner_id', EMPLOYEE_ID)
      .attach('file', Buffer.from('hello world'), {
        filename: 'memo.txt',
        contentType: 'text/plain',
      })
      .expect(400);

    expect(await prisma.document.count()).toBe(0);
    expect(await prisma.documentVersion.count()).toBe(0);
    await expect(readdir(uploadDir)).resolves.toEqual([]);
  });
});
