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

    const mockFetch: MockFetch = jest.fn((input: string | URL | Request) => {
      const url = fetchUrl(input);
      if (url.endsWith('/audit/events')) {
        return Promise.resolve(jsonResponse(201, { ok: true }));
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
    expect(response.body.version).not.toHaveProperty('object_key');

    const documents = await prisma.document.findMany();
    const versions = await prisma.documentVersion.findMany();
    expect(documents).toHaveLength(1);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.object_key).toBe('pending/object/1');
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
