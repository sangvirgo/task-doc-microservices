import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { baseTestEnv } from '@c17/testing';

import { AppModule, SERVICE } from '../src/app.module';

describe('document-security-service health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    Object.assign(
      process.env,
      baseTestEnv({
        PORT: '3005',
        DOCUMENT_SECURITY_DATABASE_URL:
          'postgresql://c17:replace-me-local-only@localhost:5433/document_security_db',
        MINIO_ENDPOINT: 'localhost',
        MINIO_PORT: '9000',
        MINIO_ACCESS_KEY: 'replace-me-local-only',
        MINIO_SECRET_KEY: 'replace-me-local-only',
        MINIO_USE_SSL: 'false',
        MINIO_BUCKET: 'documents',
        CLAMAV_HOST: 'localhost',
        CLAMAV_PORT: '3310',
        CLAMAV_TIMEOUT_MS: '10000',
        DOCUMENT_ACTIVE_KEK_VERSION: '1',
        DOCUMENT_KEK_V1: 'replace-me-local-only',
        DOCUMENT_SIGNATURE_KEY: 'replace-me-local-only',
      }),
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports itself up and names itself', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok', service: SERVICE });
  });

  it('echoes a caller-supplied correlation id', async () => {
    const correlationId = '11111111-1111-4111-8111-111111111111';

    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-correlation-id', correlationId)
      .expect(200);

    expect(response.headers['x-correlation-id']).toBe(correlationId);
  });

  it('replaces a malformed correlation id rather than trusting it', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-correlation-id', 'not-a-uuid')
      .expect(200);

    const echoed = response.headers['x-correlation-id'];
    expect(echoed).not.toBe('not-a-uuid');
    expect(echoed).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
