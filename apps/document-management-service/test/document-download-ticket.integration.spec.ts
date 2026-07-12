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
const OTHER_EMPLOYEE_ID = '10000000-0000-4000-8000-000000000002';
const PLAINTEXT_BYTES = Buffer.from('decrypted document payload');

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
  let grantEffectiveExpiresAt = '2026-07-30T12:00:00.000Z';
  let permissionAllowed = true;
  let permissionReasonCode: string | null = null;
  let redeemedBody = PLAINTEXT_BYTES;
  const auditEvents: Array<{ event_type?: string; payload?: unknown }> = [];

  beforeAll(async () => {
    process.env.MESSAGING_IN_MEMORY = 'true';

    const originalFetch = global.fetch;
    fetchMock = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/internal/permissions/check')) {
        return jsonResponse({
          json: {
            allowed: permissionAllowed,
            reason_code: permissionReasonCode,
            effective_expires_at: permissionAllowed ? grantEffectiveExpiresAt : null,
          },
        });
      }

      if (url.endsWith('/audit/events')) {
        auditEvents.push(parseJsonBody(init?.body) as { event_type?: string; payload?: unknown });
        return jsonResponse({ status: 201, json: { ok: true } });
      }

      if (url.includes('/security/') && url.endsWith('/plaintext')) {
        return new Response(redeemedBody, {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(redeemedBody.length),
          },
        });
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
    grantEffectiveExpiresAt = '2026-07-30T12:00:00.000Z';
    permissionAllowed = true;
    permissionReasonCode = null;
    redeemedBody = PLAINTEXT_BYTES;
    auditEvents.length = 0;
    await prisma.downloadTicket.deleteMany();
    await prisma.documentVersion.deleteMany();
    await prisma.document.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('caps a download ticket at the grant effective expiry', async () => {
    const { document } = await createDocumentVersion(prisma);

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

  it('redeems an authorized ticket and streams plaintext bytes', async () => {
    const { document } = await createDocumentVersion(prisma);
    const ticket = await createDownloadTicket(prisma, document.id, EMPLOYEE_ID);

    const res = await request(app.getHttpServer())
      .post(`/documents/${document.id}/versions/1/redeem`)
      .set(authHeaders(EMPLOYEE_ID))
      .send({ ticket_id: ticket.id });

    expect(res.status).toBe(200);
    expect(Buffer.compare(Buffer.from(res.body), PLAINTEXT_BYTES)).toBe(0);
    expect(res.headers['content-type']).toContain('application/octet-stream');

    const storedTicket = await prisma.downloadTicket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(storedTicket.used_at).not.toBeNull();
    expect(auditEvents.some((event) => event.event_type === 'DOCUMENT_DOWNLOAD_REDEEMED')).toBe(
      true,
    );
  });

  it('denies an expired ticket', async () => {
    const { document } = await createDocumentVersion(prisma);
    const ticket = await createDownloadTicket(
      prisma,
      document.id,
      EMPLOYEE_ID,
      new Date('2026-07-29T08:59:59.000Z'),
    );

    const res = await request(app.getHttpServer())
      .post(`/documents/${document.id}/versions/1/redeem`)
      .set(authHeaders(EMPLOYEE_ID))
      .send({ ticket_id: ticket.id });

    expect(res.status).toBe(403);
    expect(findAuditReasonCode(auditEvents)).toBe('DOWNLOAD_TICKET_EXPIRED');
  });

  it('denies redemption by the wrong actor', async () => {
    const { document } = await createDocumentVersion(prisma);
    const ticket = await createDownloadTicket(prisma, document.id, EMPLOYEE_ID);

    const res = await request(app.getHttpServer())
      .post(`/documents/${document.id}/versions/1/redeem`)
      .set(authHeaders(OTHER_EMPLOYEE_ID))
      .send({ ticket_id: ticket.id });

    expect(res.status).toBe(403);
    expect(findAuditReasonCode(auditEvents)).toBe('DOWNLOAD_TICKET_ACTOR_MISMATCH');
  });

  it('denies redemption after grant revocation at request time', async () => {
    const { document } = await createDocumentVersion(prisma);
    const ticket = await createDownloadTicket(prisma, document.id, EMPLOYEE_ID);
    permissionAllowed = false;
    permissionReasonCode = 'GRANT_REVOKED';

    const res = await request(app.getHttpServer())
      .post(`/documents/${document.id}/versions/1/redeem`)
      .set(authHeaders(EMPLOYEE_ID))
      .send({ ticket_id: ticket.id });

    expect(res.status).toBe(403);
    expect(findAuditReasonCode(auditEvents)).toBe('GRANT_REVOKED');
  });

  it('denies reuse of a single-use ticket', async () => {
    const { document } = await createDocumentVersion(prisma);
    const ticket = await createDownloadTicket(prisma, document.id, EMPLOYEE_ID);

    const first = await request(app.getHttpServer())
      .post(`/documents/${document.id}/versions/1/redeem`)
      .set(authHeaders(EMPLOYEE_ID))
      .send({ ticket_id: ticket.id });
    expect(first.status).toBe(200);

    auditEvents.length = 0;

    const second = await request(app.getHttpServer())
      .post(`/documents/${document.id}/versions/1/redeem`)
      .set(authHeaders(EMPLOYEE_ID))
      .send({ ticket_id: ticket.id });

    expect(second.status).toBe(403);
    expect(findAuditReasonCode(auditEvents)).toBe('DOWNLOAD_TICKET_ALREADY_USED');
  });
});

async function createDocumentVersion(prisma: DocumentPrismaService) {
  const document = await prisma.document.create({
    data: {
      title: 'Grant-bounded document',
      document_type: 'MEMO',
      owner_id: EMPLOYEE_ID,
      creator_id: EMPLOYEE_ID,
    },
  });

  const version = await prisma.documentVersion.create({
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

  return { document, version };
}

async function createDownloadTicket(
  prisma: DocumentPrismaService,
  documentId: string,
  actorId: string,
  expiresAt = new Date('2026-07-30T12:00:00.000Z'),
) {
  return prisma.downloadTicket.create({
    data: {
      document_id: documentId,
      version: 1,
      actor_id: actorId,
      object_key: 'minio/object/1',
      expires_at: expiresAt,
    },
  });
}

function findAuditReasonCode(
  auditEvents: Array<{ event_type?: string; payload?: unknown }>,
): string | null {
  const deniedEvent = auditEvents.findLast(
    (event) => event.event_type === 'DOCUMENT_DOWNLOAD_DENIED',
  );
  const payload =
    deniedEvent && typeof deniedEvent.payload === 'object' && deniedEvent.payload
      ? (deniedEvent.payload as Record<string, unknown>)
      : null;
  return typeof payload?.reason_code === 'string' ? payload.reason_code : null;
}
