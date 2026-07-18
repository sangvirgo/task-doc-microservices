import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { mkdtempSync } from 'fs';
import { readdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { Client } from 'minio';

import { baseTestEnv } from '@c17/testing';

import { DocumentSecurityPrismaService } from '../src/prisma/document-security-prisma.service';
import { SecurityPipelineService } from '../src/security/security-pipeline.service';

const MINIO_BUCKET = 'documents';
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

describe('Document security pipeline integration (PostgreSQL + MinIO + ClamAV)', () => {
  let app: INestApplication;
  let prisma: DocumentSecurityPrismaService;
  let pipelineService: SecurityPipelineService;
  let minioClient: Client;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'c17-document-security-test-'));

    Object.assign(
      process.env,
      baseTestEnv({
        PORT: '3005',
        DOCUMENT_SECURITY_DATABASE_URL:
          'postgresql://c17:c17pass-local-test-000@localhost:5433/document_security_db',
        MINIO_ENDPOINT: 'localhost',
        MINIO_PORT: '9000',
        MINIO_ACCESS_KEY: 'c17pass-local-test-000',
        MINIO_SECRET_KEY: 'c17pass-local-test-000',
        MINIO_USE_SSL: 'false',
        MINIO_BUCKET,
        CLAMAV_HOST: 'localhost',
        CLAMAV_PORT: '3310',
        CLAMAV_TIMEOUT_MS: '10000',
        DOCUMENT_ACTIVE_KEK_VERSION: '1',
        DOCUMENT_KEK_V1: 'c17pass-local-test-000',
        DOCUMENT_SIGNATURE_KEY: 'c17pass-local-test-000',
        DOCUMENT_SECURITY_TMP_DIR: tempDir,
      }),
    );

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    prisma = moduleRef.get(DocumentSecurityPrismaService);
    pipelineService = moduleRef.get(SecurityPipelineService);
    minioClient = new Client({
      endPoint: 'localhost',
      port: 9000,
      useSSL: false,
      accessKey: 'c17pass-local-test-000',
      secretKey: 'c17pass-local-test-000',
    });
    await app.init();
    await ensureBucket();
  });

  beforeEach(async () => {
    await prisma.encryptionRecord.deleteMany();
    await clearBucketPrefix('documents/');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it('stores ciphertext in MinIO after a clean upload', async () => {
    const documentId = randomUUID();
    const payload = Buffer.from('clean upload document');

    const response = await request(app.getHttpServer())
      .post('/security/uploads/process')
      .set('x-document-id', documentId)
      .set('x-document-version', '1')
      .set('x-document-file-size', String(payload.length))
      .set('content-type', 'text/plain')
      .send(payload)
      .expect(201);

    expect(response.body.scan_status).toBe('CLEAN');

    const record = await prisma.encryptionRecord.findUnique({
      where: { document_id_version: { document_id: documentId, version: 1 } },
    });
    expect(record).not.toBeNull();
    expect(record?.scan_status).toBe('CLEAN');

    const statObject = await minioClient.statObject(MINIO_BUCKET, record!.object_key);
    expect(statObject.size).toBe(payload.length);

    const ciphertext = await readObject(record!.object_key);
    expect(ciphertext.equals(payload)).toBe(false);
  });

  it('rejects infected uploads without creating a record or object', async () => {
    const documentId = randomUUID();

    await request(app.getHttpServer())
      .post('/security/uploads/process')
      .set('x-document-id', documentId)
      .set('x-document-version', '1')
      .set('x-document-file-size', String(Buffer.byteLength(EICAR)))
      .set('content-type', 'text/plain')
      .send(EICAR)
      .expect(400);

    expect(await prisma.encryptionRecord.count()).toBe(0);
    const keys = await listBucketKeys();
    expect(keys).toEqual([]);
  });

  it('decrypts back to the original plaintext and uses a new DEK for each upload', async () => {
    const plaintext = Buffer.from('roundtrip content');
    const documentOne = randomUUID();
    const documentTwo = randomUUID();

    await upload(documentOne, plaintext);
    await upload(documentTwo, plaintext);

    const [recordOne, recordTwo] = await prisma.encryptionRecord.findMany({
      orderBy: { created_at: 'asc' },
    });

    expect(recordOne?.encrypted_dek).not.toBe(recordTwo?.encrypted_dek);

    const decryptedOne = await pipelineService.decryptDocumentVersionToBuffer(documentOne, 1);
    const decryptedTwo = await pipelineService.decryptDocumentVersionToBuffer(documentTwo, 1);
    expect(decryptedOne.equals(plaintext)).toBe(true);
    expect(decryptedTwo.equals(plaintext)).toBe(true);
  });

  it('removes temporary plaintext after success and failure', async () => {
    const cleanDocument = randomUUID();
    await upload(cleanDocument, Buffer.from('cleanup success'));
    expect(await readdir(tempDir)).toEqual([]);

    await request(app.getHttpServer())
      .post('/security/uploads/process')
      .set('x-document-id', randomUUID())
      .set('x-document-version', '1')
      .set('x-document-file-size', String(Buffer.byteLength(EICAR)))
      .set('content-type', 'text/plain')
      .send(EICAR)
      .expect(400);

    expect(await readdir(tempDir)).toEqual([]);
  });

  async function upload(documentId: string, payload: Buffer): Promise<void> {
    await request(app.getHttpServer())
      .post('/security/uploads/process')
      .set('x-document-id', documentId)
      .set('x-document-version', '1')
      .set('x-document-file-size', String(payload.length))
      .set('content-type', 'text/plain')
      .send(payload)
      .expect(201);
  }

  async function readObject(objectKey: string): Promise<Buffer> {
    const objectStream = await minioClient.getObject(MINIO_BUCKET, objectKey);
    return streamToBuffer(objectStream);
  }

  async function listBucketKeys(): Promise<string[]> {
    await ensureBucket();
    const keys: string[] = [];
    const stream = minioClient.listObjects(MINIO_BUCKET, '', true);

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (item: { name?: string }) => {
        if (item.name) keys.push(item.name);
      });
      stream.once('end', () => resolve());
      stream.once('error', reject);
    });

    return keys;
  }

  async function clearBucketPrefix(prefix: string): Promise<void> {
    const objects = await listBucketKeys();
    const matching = objects.filter((name) => name.startsWith(prefix));
    if (matching.length === 0) return;
    await Promise.all(matching.map((name) => minioClient.removeObject(MINIO_BUCKET, name)));
  }

  async function ensureBucket(): Promise<void> {
    const exists = await minioClient.bucketExists(MINIO_BUCKET);
    if (!exists) {
      await minioClient.makeBucket(MINIO_BUCKET);
    }
  }
});

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.once('end', () => resolve());
    stream.once('error', reject);
  });

  return Buffer.concat(chunks);
}
