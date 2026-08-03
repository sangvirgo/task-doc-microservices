import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { attachAuthContextFromHeaders } from '@c17/auth-context';

import { DocumentPrismaService } from '../src/prisma/document-prisma.service';

jest.mock('minio', () => {
  const mockStatObject = jest.fn().mockResolvedValue({});
  const mockRemoveObject = jest.fn().mockResolvedValue(undefined);
  return {
    Client: jest.fn().mockImplementation(() => ({
      statObject: mockStatObject,
      removeObject: mockRemoveObject,
    })),
    __mockStatObject: mockStatObject,
    __mockRemoveObject: mockRemoveObject,
  };
});

const minioMock: {
  __mockStatObject: jest.Mock;
  __mockRemoveObject: jest.Mock;
} = jest.requireMock('minio');

type MockFetch = typeof fetch & jest.MockedFunction<typeof fetch>;

const EMPLOYEE_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_EMPLOYEE_ID = '20000000-0000-4000-8000-000000000002';
const ADMIN_ID = '30000000-0000-4000-8000-000000000003';

function employeeHeaders(): Record<string, string> {
  return {
    'x-user-id': EMPLOYEE_ID,
    'x-user-role': 'EMPLOYEE',
    'x-user-capabilities': JSON.stringify(['DISPOSAL_APPROVE']),
    'x-correlation-id': randomUUID(),
  };
}

function adminHeaders(): Record<string, string> {
  return {
    'x-user-id': ADMIN_ID,
    'x-user-role': 'ADMIN',
    'x-user-capabilities': '[]',
    'x-correlation-id': randomUUID(),
  };
}

function otherEmployeeHeaders(): Record<string, string> {
  return {
    'x-user-id': OTHER_EMPLOYEE_ID,
    'x-user-role': 'EMPLOYEE',
    'x-user-capabilities': '[]',
    'x-correlation-id': randomUUID(),
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

describe('Retention and disposal integration (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: DocumentPrismaService;
  let fetchMock: MockFetch;

  beforeAll(async () => {
    process.env.MESSAGING_IN_MEMORY = 'true';

    const mockFetch: MockFetch = jest.fn((input: string | URL | Request) => {
      const url = fetchUrl(input);
      if (url.endsWith('/audit/events')) {
        return Promise.resolve(jsonResponse(201, { ok: true }));
      }
      if (url.endsWith('/internal/permissions/check')) {
        return Promise.resolve(
          jsonResponse(200, {
            allowed: true,
            reason_code: null,
            effective_expires_at: null,
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
    await prisma.disposalApproval.deleteMany();
    await prisma.retentionHold.deleteMany();
    await prisma.documentVersion.deleteMany();
    await prisma.document.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Retention eligibility', () => {
    it('marks DISPOSED_ELIGIBLE without deleting content', async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
          archive_status: 'ARCHIVED',
          retention_expires_at: new Date(Date.now() - 1000),
        },
      });

      const res = await request(app.getHttpServer())
        .post('/retention-disposal/check-eligibility')
        .set(employeeHeaders())
        .expect(200);

      expect(res.body.eligible_count).toBe(1);
      expect(res.body.eligible_ids).toContain(doc.id);

      const updatedDoc = await prisma.document.findUnique({ where: { id: doc.id } });
      expect(updatedDoc?.disposal_status).toBe('DISPOSED_ELIGIBLE');
    });

    it('does not mark documents without archive status', async () => {
      await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
          retention_expires_at: new Date(Date.now() - 1000),
        },
      });

      const res = await request(app.getHttpServer())
        .post('/retention-disposal/check-eligibility')
        .set(employeeHeaders())
        .expect(200);

      expect(res.body.eligible_count).toBe(0);
    });

    it('does not mark documents with active retention hold', async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
          archive_status: 'ARCHIVED',
          retention_expires_at: new Date(Date.now() - 1000),
        },
      });

      await request(app.getHttpServer())
        .post('/retention-disposal/holds')
        .set(employeeHeaders())
        .send({ document_id: doc.id, reason: 'Legal investigation' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/retention-disposal/check-eligibility')
        .set(employeeHeaders())
        .expect(200);

      expect(res.body.eligible_count).toBe(0);
    });
  });

  describe('Retention holds', () => {
    it('places and releases a retention hold', async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
        },
      });

      const placeRes = await request(app.getHttpServer())
        .post('/retention-disposal/holds')
        .set(employeeHeaders())
        .send({ document_id: doc.id, reason: 'Legal hold' })
        .expect(201);

      expect(placeRes.body.document_id).toBe(doc.id);

      const releaseRes = await request(app.getHttpServer())
        .post(`/retention-disposal/holds/${placeRes.body.id}/release`)
        .set(employeeHeaders())
        .expect(200);

      expect(releaseRes.body.released_at).toBeDefined();
    });

    it("does not expose or release another employee's hold", async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Scoped Hold',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
        },
      });

      const placeRes = await request(app.getHttpServer())
        .post('/retention-disposal/holds')
        .set(employeeHeaders())
        .send({ document_id: doc.id, reason: 'Legal hold' })
        .expect(201);

      await request(app.getHttpServer())
        .get('/retention-disposal/holds')
        .set(otherEmployeeHeaders())
        .expect(200)
        .expect([]);

      await request(app.getHttpServer())
        .post(`/retention-disposal/holds/${placeRes.body.id}/release`)
        .set(otherEmployeeHeaders())
        .expect(403);

      const hold = await prisma.retentionHold.findUnique({ where: { id: placeRes.body.id } });
      expect(hold?.released_at).toBeNull();
    });

    it('rejects duplicate active hold', async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
        },
      });

      await request(app.getHttpServer())
        .post('/retention-disposal/holds')
        .set(employeeHeaders())
        .send({ document_id: doc.id, reason: 'First hold' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/retention-disposal/holds')
        .set(employeeHeaders())
        .send({ document_id: doc.id, reason: 'Second hold' })
        .expect(400);
    });
  });

  describe('Disposal approval', () => {
    it('requires DISPOSAL_APPROVE capability', async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
          disposal_status: 'DISPOSED_ELIGIBLE',
        },
      });

      await request(app.getHttpServer())
        .post('/retention-disposal/approve-disposal')
        .set({
          'x-user-id': EMPLOYEE_ID,
          'x-user-role': 'EMPLOYEE',
          'x-user-capabilities': '[]',
          'x-correlation-id': randomUUID(),
        })
        .send({ document_id: doc.id, reason: 'Retention expired' })
        .expect(403);
    });

    it('ADMIN cannot approve disposal', async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
          disposal_status: 'DISPOSED_ELIGIBLE',
        },
      });

      await request(app.getHttpServer())
        .post('/retention-disposal/approve-disposal')
        .set(adminHeaders())
        .send({ document_id: doc.id, reason: 'Retention expired' })
        .expect(403);
    });

    it('rejects approval for non-eligible document', async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
        },
      });

      await request(app.getHttpServer())
        .post('/retention-disposal/approve-disposal')
        .set(employeeHeaders())
        .send({ document_id: doc.id, reason: 'Retention expired' })
        .expect(400);
    });

    it('prevents disposal while hold is active', async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
          disposal_status: 'DISPOSED_ELIGIBLE',
        },
      });

      await request(app.getHttpServer())
        .post('/retention-disposal/holds')
        .set(employeeHeaders())
        .send({ document_id: doc.id, reason: 'Active investigation' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/retention-disposal/approve-disposal')
        .set(employeeHeaders())
        .send({ document_id: doc.id, reason: 'Retention expired' })
        .expect(400);
    });
  });

  describe('Disposal execution', () => {
    beforeEach(() => {
      minioMock.__mockStatObject.mockResolvedValue({});
      minioMock.__mockRemoveObject.mockResolvedValue(undefined);
    });

    it('removes ciphertext while audit evidence remains', async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
          disposal_status: 'DISPOSED_ELIGIBLE',
        },
      });

      await prisma.documentVersion.create({
        data: {
          document_id: doc.id,
          version: 1,
          object_key: 'test-object-key',
          checksum: 'test-checksum',
          encrypted_dek: 'encrypted-dek',
          file_size: 100,
          mime_type: 'text/plain',
          created_by: EMPLOYEE_ID,
        },
      });

      await prisma.disposalApproval.create({
        data: {
          document_id: doc.id,
          approver_id: EMPLOYEE_ID,
          reason: 'Retention expired',
        },
      });

      const res = await request(app.getHttpServer())
        .post('/retention-disposal/execute-disposal')
        .set(employeeHeaders())
        .send({ document_id: doc.id })
        .expect(200);

      expect(res.body.status).toBe('DISPOSED');
      expect(res.body.objects_deleted).toBe(1);
      expect(minioMock.__mockRemoveObject).toHaveBeenCalledWith(
        expect.any(String),
        'test-object-key',
      );

      const updatedDoc = await prisma.document.findUnique({ where: { id: doc.id } });
      expect(updatedDoc?.disposal_status).toBe('DISPOSED');
    });

    it('does not produce DISPOSED when object deletion fails', async () => {
      minioMock.__mockStatObject.mockRejectedValue(new Error('NoSuchKey'));

      const doc = await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
          disposal_status: 'DISPOSED_ELIGIBLE',
        },
      });

      await prisma.documentVersion.create({
        data: {
          document_id: doc.id,
          version: 1,
          object_key: 'nonexistent-object-key-that-will-fail',
          checksum: 'test-checksum',
          encrypted_dek: 'encrypted-dek',
          file_size: 100,
          mime_type: 'text/plain',
          created_by: EMPLOYEE_ID,
        },
      });

      await prisma.disposalApproval.create({
        data: {
          document_id: doc.id,
          approver_id: EMPLOYEE_ID,
          reason: 'Retention expired',
        },
      });

      const res = await request(app.getHttpServer())
        .post('/retention-disposal/execute-disposal')
        .set(employeeHeaders())
        .send({ document_id: doc.id })
        .expect(200);

      expect(res.body.status).toBe('DELETION_FAILED');

      const updatedDoc = await prisma.document.findUnique({ where: { id: doc.id } });
      expect(updatedDoc?.disposal_status).toBe('DISPOSED_ELIGIBLE');
    });
  });
});
