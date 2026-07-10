import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { attachAuthContextFromHeaders } from '@c17/auth-context';
import { DocumentPrismaService } from '../src/prisma/document-prisma.service';

type FetchResponseInit = {
  status?: number;
  json?: unknown;
};

type MockFetch = typeof fetch & jest.MockedFunction<typeof fetch>;

const EMPLOYEE_ID = '10000000-0000-4000-8000-000000000001';

function authHeaders(userId: string): Record<string, string> {
  return {
    'x-user-id': userId,
    'x-user-role': 'EMPLOYEE',
    'x-correlation-id': randomUUID(),
  };
}

function jsonResponse(init: FetchResponseInit): Response {
  return new Response(JSON.stringify(init.json ?? {}), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseJsonBody(body: RequestInit['body'] | null | undefined): unknown {
  if (typeof body !== 'string') {
    throw new Error('Expected JSON request body');
  }

  return JSON.parse(body);
}

describe('Document download ticket integration (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: DocumentPrismaService;
  let fetchMock: MockFetch;
  let grantEffectiveExpiresAt = '2026-07-29T12:00:00.000Z';

  beforeAll(async () => {
    process.env.MESSAGING_IN_MEMORY = 'true';

    const originalFetch = global.fetch;
    fetchMock = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/internal/permissions/check')) {
        return jsonResponse({
          json: {
            allowed: true,
            reason_code: null,
            effective_expires_at: grantEffectiveExpiresAt,
          },
        });
      }

      if (url.endsWith('/audit/events')) {
        parseJsonBody(init?.body);
        return jsonResponse({ status: 201, json: { ok: true } });
      }

      if (originalFetch) {
        return originalFetch(input, init);
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

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
    grantEffectiveExpiresAt = '2026-07-29T12:00:00.000Z';
    await prisma.downloadTicket.deleteMany();
    await prisma.documentVersion.deleteMany();
    await prisma.document.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('caps a download ticket at the grant effective expiry', async () => {
    const document = await prisma.document.create({
      data: {
        title: 'Grant-bounded document',
        document_type: 'MEMO',
        owner_id: EMPLOYEE_ID,
        creator_id: EMPLOYEE_ID,
      },
    });

    await prisma.documentVersion.create({
      data: {
        document_id: document.id,
        version: 1,
        object_key: 'minio/object/1',
        checksum: 'checksum-1',
        encrypted_dek: 'encrypted-dek-1',
        file_size: 128,
        mime_type: 'text/plain',
        created_by: EMPLOYEE_ID,
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/documents/${document.id}/download-ticket`)
      .set(authHeaders(EMPLOYEE_ID))
      .send({
        version: 1,
        expires_in_seconds: 60 * 60 * 24,
      });

    expect(res.status).toBe(201);
    expect(res.body.expires_at).toBe(grantEffectiveExpiresAt);
  });
});
