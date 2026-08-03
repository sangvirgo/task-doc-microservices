import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

describe('API Gateway security policy', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-value-with-at-least-32-chars';
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    jwtService = moduleRef.get(JwtService);
    await app.init();
  });

  afterAll(async () => app.close());

  it('blocks employee access to admin and internal-only control-plane routes', async () => {
    const token = jwtService.sign({
      sub: '10000000-0000-4000-8000-000000000001',
      role: 'EMPLOYEE',
      capabilities: [],
    });

    for (const [method, path] of [
      ['get', '/api/users'],
      ['get', '/api/monitoring/alerts'],
      ['post', '/api/monitoring/events'],
      ['post', '/api/audit/events'],
    ] as const) {
      await request(app.getHttpServer())
        [method](path)
        .set('authorization', `Bearer ${token}`)
        .expect(403);
    }
  });

  it('keeps employee grant workflow reachable while scoping foreign grant queries', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const token = jwtService.sign({
      sub: '10000000-0000-4000-8000-000000000001',
      role: 'EMPLOYEE',
      capabilities: [],
    });

    await request(app.getHttpServer())
      .get('/api/permissions/grants?actor_id=10000000-0000-4000-8000-000000000001')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/permissions/grants?actor_id=20000000-0000-4000-8000-000000000002')
      .set('authorization', `Bearer ${token}`)
      .expect(403);
  });
});
