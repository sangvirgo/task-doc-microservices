import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { attachAuthContextFromHeaders } from '@c17/auth-context';

import { DocumentPrismaService } from '../src/prisma/document-prisma.service';

type MockFetch = typeof fetch & jest.MockedFunction<typeof fetch>;

const EMPLOYEE_ID = '10000000-0000-4000-8000-000000000001';
const EMPLOYEE_ID_2 = '20000000-0000-4000-8000-000000000002';
const ADMIN_ID = '30000000-0000-4000-8000-000000000003';

function employeeHeaders(userId: string = EMPLOYEE_ID): Record<string, string> {
  return {
    'x-user-id': userId,
    'x-user-role': 'EMPLOYEE',
    'x-user-capabilities': JSON.stringify(['ARCHIVE_SUBMIT', 'ARCHIVE_RECEIVE']),
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

function submitterHeaders(): Record<string, string> {
  return {
    'x-user-id': EMPLOYEE_ID,
    'x-user-role': 'EMPLOYEE',
    'x-user-capabilities': JSON.stringify(['ARCHIVE_SUBMIT']),
    'x-correlation-id': randomUUID(),
  };
}

function archivistHeaders(): Record<string, string> {
  return {
    'x-user-id': EMPLOYEE_ID_2,
    'x-user-role': 'EMPLOYEE',
    'x-user-capabilities': JSON.stringify(['ARCHIVE_RECEIVE']),
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

describe('Archive and transfer package integration (PostgreSQL)', () => {
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
    await prisma.transferPackage.deleteMany();
    await prisma.recordEntry.deleteMany();
    await prisma.record.deleteMany();
    await prisma.documentVersion.deleteMany();
    await prisma.document.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Record lifecycle', () => {
    it('creates a record and adds document entries', async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
          security_level: 'INTERNAL',
        },
      });

      const version = await prisma.documentVersion.create({
        data: {
          document_id: doc.id,
          version: 1,
          object_key: 'test/key',
          checksum: 'test-checksum',
          encrypted_dek: 'encrypted-dek',
          file_size: 100,
          mime_type: 'text/plain',
          created_by: EMPLOYEE_ID,
        },
      });

      const createRes = await request(app.getHttpServer())
        .post('/records')
        .set(employeeHeaders())
        .send({ title: 'Test Record', description: 'A test record' })
        .expect(201);

      expect(createRes.body.status).toBe('DRAFT');
      const recordId = createRes.body.id;

      const entryRes = await request(app.getHttpServer())
        .post(`/records/${recordId}/entries`)
        .set(employeeHeaders())
        .send({ document_id: doc.id, document_version_id: version.id })
        .expect(201);

      expect(entryRes.body.document_id).toBe(doc.id);

      const getRes = await request(app.getHttpServer())
        .get(`/records/${recordId}`)
        .set(employeeHeaders())
        .expect(200);

      expect(getRes.body.entries).toHaveLength(1);
    });

    it('rejects sealing an empty record', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/records')
        .set(employeeHeaders())
        .send({ title: 'Empty Record' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/records/${createRes.body.id}/seal`)
        .set(employeeHeaders())
        .expect(400);
    });

    it('rejects adding entries to a sealed record', async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
        },
      });

      const version = await prisma.documentVersion.create({
        data: {
          document_id: doc.id,
          version: 1,
          object_key: 'test/key',
          checksum: 'test-checksum',
          encrypted_dek: 'encrypted-dek',
          file_size: 100,
          mime_type: 'text/plain',
          created_by: EMPLOYEE_ID,
        },
      });

      const createRes = await request(app.getHttpServer())
        .post('/records')
        .set(employeeHeaders())
        .send({ title: 'Test Record' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/records/${createRes.body.id}/entries`)
        .set(employeeHeaders())
        .send({ document_id: doc.id, document_version_id: version.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/records/${createRes.body.id}/seal`)
        .set(employeeHeaders())
        .expect(200);

      await request(app.getHttpServer())
        .post(`/records/${createRes.body.id}/entries`)
        .set(employeeHeaders())
        .send({ document_id: doc.id, document_version_id: version.id })
        .expect(400);
    });
  });

  describe('Transfer package lifecycle', () => {
    let recordId: string;

    beforeEach(async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Archive Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
        },
      });

      const version = await prisma.documentVersion.create({
        data: {
          document_id: doc.id,
          version: 1,
          object_key: 'archive/key',
          checksum: 'archive-checksum',
          encrypted_dek: 'encrypted-dek',
          file_size: 200,
          mime_type: 'application/pdf',
          created_by: EMPLOYEE_ID,
        },
      });

      const createRes = await request(app.getHttpServer())
        .post('/records')
        .set(employeeHeaders())
        .send({ title: 'Archive Record' })
        .expect(201);

      recordId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/records/${recordId}/entries`)
        .set(employeeHeaders())
        .send({ document_id: doc.id, document_version_id: version.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/records/${recordId}/seal`)
        .set(employeeHeaders())
        .expect(200);
    });

    it('creates and submits a transfer package', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/transfer-packages')
        .set(submitterHeaders())
        .send({ record_id: recordId })
        .expect(201);

      expect(createRes.body.status).toBe('DRAFT');
      expect(createRes.body.manifest).toBeDefined();
      expect(createRes.body.checksums).toBeDefined();
      expect(createRes.body.package_checksum).toBeDefined();
      expect(createRes.body.signature).toBeDefined();

      const packageId = createRes.body.id;

      const submitRes = await request(app.getHttpServer())
        .post(`/transfer-packages/${packageId}/submit`)
        .set(submitterHeaders())
        .expect(200);

      expect(submitRes.body.status).toBe('SUBMITTED');
    });

    it('rejects submission by non-submitter', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/transfer-packages')
        .set(submitterHeaders())
        .send({ record_id: recordId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/transfer-packages/${createRes.body.id}/submit`)
        .set(archivistHeaders())
        .expect(403);
    });

    it('rejects submission of non-DRAFT package', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/transfer-packages')
        .set(submitterHeaders())
        .send({ record_id: recordId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/transfer-packages/${createRes.body.id}/submit`)
        .set(submitterHeaders())
        .expect(200);

      await request(app.getHttpServer())
        .post(`/transfer-packages/${createRes.body.id}/submit`)
        .set(submitterHeaders())
        .expect(400);
    });

    it('submitter cannot receive their own package', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/transfer-packages')
        .set(submitterHeaders())
        .send({ record_id: recordId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/transfer-packages/${createRes.body.id}/submit`)
        .set(submitterHeaders())
        .expect(200);

      await request(app.getHttpServer())
        .post(`/transfer-packages/${createRes.body.id}/receive`)
        .set(submitterHeaders())
        .expect(403);
    });

    it('accepts and archives a valid package', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/transfer-packages')
        .set(submitterHeaders())
        .send({ record_id: recordId })
        .expect(201);

      const packageId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/transfer-packages/${packageId}/submit`)
        .set(submitterHeaders())
        .expect(200);

      await request(app.getHttpServer())
        .post(`/transfer-packages/${packageId}/receive`)
        .set(archivistHeaders())
        .expect(200);

      const acceptRes = await request(app.getHttpServer())
        .post(`/transfer-packages/${packageId}/accept`)
        .set(archivistHeaders())
        .expect(200);

      expect(acceptRes.body.status).toBe('ACCEPTED');
      expect(acceptRes.body.receipt).toBeDefined();

      const archiveRes = await request(app.getHttpServer())
        .post(`/transfer-packages/${packageId}/archive`)
        .set(archivistHeaders())
        .expect(200);

      expect(archiveRes.body.status).toBe('ARCHIVED');
    });

    it('rejects a package with a safe reason', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/transfer-packages')
        .set(submitterHeaders())
        .send({ record_id: recordId })
        .expect(201);

      const packageId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/transfer-packages/${packageId}/submit`)
        .set(submitterHeaders())
        .expect(200);

      await request(app.getHttpServer())
        .post(`/transfer-packages/${packageId}/receive`)
        .set(archivistHeaders())
        .expect(200);

      const rejectRes = await request(app.getHttpServer())
        .post(`/transfer-packages/${packageId}/reject`)
        .set(archivistHeaders())
        .send({ rejection_reason: 'Checksum mismatch detected' })
        .expect(200);

      expect(rejectRes.body.status).toBe('REJECTED');
      expect(rejectRes.body.rejection_reason).toBe('Checksum mismatch detected');
      expect(rejectRes.body.receipt).toBeDefined();
    });
  });

  describe('ADMIN denial', () => {
    it('ADMIN cannot create records', async () => {
      await request(app.getHttpServer())
        .post('/records')
        .set(adminHeaders())
        .send({ title: 'Admin Record' })
        .expect(403);
    });

    it('ADMIN cannot create transfer packages', async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
        },
      });

      const version = await prisma.documentVersion.create({
        data: {
          document_id: doc.id,
          version: 1,
          object_key: 'test/key',
          checksum: 'test-checksum',
          encrypted_dek: 'encrypted-dek',
          file_size: 100,
          mime_type: 'text/plain',
          created_by: EMPLOYEE_ID,
        },
      });

      const createRes = await request(app.getHttpServer())
        .post('/records')
        .set(employeeHeaders())
        .send({ title: 'Test Record' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/records/${createRes.body.id}/entries`)
        .set(employeeHeaders())
        .send({ document_id: doc.id, document_version_id: version.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/records/${createRes.body.id}/seal`)
        .set(employeeHeaders())
        .expect(200);

      await request(app.getHttpServer())
        .post('/transfer-packages')
        .set(adminHeaders())
        .send({ record_id: createRes.body.id })
        .expect(403);
    });

    it('ADMIN cannot submit transfer packages', async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
        },
      });

      const version = await prisma.documentVersion.create({
        data: {
          document_id: doc.id,
          version: 1,
          object_key: 'test/key',
          checksum: 'test-checksum',
          encrypted_dek: 'encrypted-dek',
          file_size: 100,
          mime_type: 'text/plain',
          created_by: EMPLOYEE_ID,
        },
      });

      const createRes = await request(app.getHttpServer())
        .post('/records')
        .set(employeeHeaders())
        .send({ title: 'Test Record' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/records/${createRes.body.id}/entries`)
        .set(employeeHeaders())
        .send({ document_id: doc.id, document_version_id: version.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/records/${createRes.body.id}/seal`)
        .set(employeeHeaders())
        .expect(200);

      const pkgRes = await request(app.getHttpServer())
        .post('/transfer-packages')
        .set(employeeHeaders())
        .send({ record_id: createRes.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/transfer-packages/${pkgRes.body.id}/submit`)
        .set(adminHeaders())
        .expect(403);
    });

    it('ADMIN cannot receive transfer packages', async () => {
      const doc = await prisma.document.create({
        data: {
          title: 'Test Document',
          document_type: 'REPORT',
          owner_id: EMPLOYEE_ID,
          creator_id: EMPLOYEE_ID,
        },
      });

      const version = await prisma.documentVersion.create({
        data: {
          document_id: doc.id,
          version: 1,
          object_key: 'test/key',
          checksum: 'test-checksum',
          encrypted_dek: 'encrypted-dek',
          file_size: 100,
          mime_type: 'text/plain',
          created_by: EMPLOYEE_ID,
        },
      });

      const createRes = await request(app.getHttpServer())
        .post('/records')
        .set(employeeHeaders())
        .send({ title: 'Test Record' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/records/${createRes.body.id}/entries`)
        .set(employeeHeaders())
        .send({ document_id: doc.id, document_version_id: version.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/records/${createRes.body.id}/seal`)
        .set(employeeHeaders())
        .expect(200);

      const pkgRes = await request(app.getHttpServer())
        .post('/transfer-packages')
        .set(employeeHeaders())
        .send({ record_id: createRes.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/transfer-packages/${pkgRes.body.id}/submit`)
        .set(employeeHeaders())
        .expect(200);

      await request(app.getHttpServer())
        .post(`/transfer-packages/${pkgRes.body.id}/receive`)
        .set(adminHeaders())
        .expect(403);
    });
  });
});
