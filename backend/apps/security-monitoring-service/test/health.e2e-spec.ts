import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule, SERVICE } from '../src/app.module';

describe('security-monitoring-service health', () => {
  let app: INestApplication;

  beforeAll(async () => {
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
