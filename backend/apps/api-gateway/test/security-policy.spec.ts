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
    app.enableCors({ origin: ['http://13.229.104.126:3100'] });
    jwtService = moduleRef.get(JwtService);
    await app.init();
  });

  afterAll(async () => app.close());

  it('allows the deployed web origin for browser API calls', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/auth/login')
      .set('origin', 'http://13.229.104.126:3100')
      .set('access-control-request-method', 'POST')
      .set('access-control-request-headers', 'content-type')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe('http://13.229.104.126:3100');
  });
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
      ['get', '/api/security/kek/active'],
      ['get', '/api/security/records'],
      ['post', '/api/permissions/internal/permissions/check'],
      ['post', '/api/auth/internal/sessions/revoke-all'],
      ['get', '/api/tasks/internal/statistics'],
      ['get', '/api/documents/internal/statistics'],
      ['get', '/api/users/internal/statistics'],
      ['get', '/api/monitoring/internal/statistics'],
      ['post', '/api/documents/30000000-0000-4000-8000-000000000003/versions'],
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

  it('routes Task–Document endpoints to Document Management Service', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ association: { id: 'association-1' }, grants: [] }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const taskId = '10000000-0000-4000-a000-000000000001';
    const documentId = '20000000-0000-4000-a000-000000000002';
    const token = jwtService.sign({
      sub: '10000000-0000-4000-a000-000000000001',
      role: 'EMPLOYEE',
      capabilities: [],
    });

    await request(app.getHttpServer())
      .post(`/api/tasks/${taskId}/documents`)
      .set('authorization', `Bearer ${token}`)
      .send({
        document_id: documentId,
        grants: [
          {
            actor_id: '30000000-0000-4000-a000-000000000003',
            permissions: ['PREVIEW'],
            expires_at: '2026-08-10T17:00:00.000Z',
          },
        ],
      })
      .expect(201);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3004/tasks/${taskId}/documents`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-user-id': '10000000-0000-4000-a000-000000000001',
          'x-user-role': 'EMPLOYEE',
        }),
        body: JSON.stringify({
          document_id: documentId,
          grants: [
            {
              actor_id: '30000000-0000-4000-a000-000000000003',
              permissions: ['PREVIEW'],
              expires_at: '2026-08-10T17:00:00.000Z',
            },
          ],
        }),
      }),
    );
  });

  it('blocks audit append even when the public path has a trailing slash', async () => {
    const token = jwtService.sign({
      sub: '20000000-0000-4000-8000-000000000002',
      role: 'ADMIN',
      capabilities: [],
    });

    await request(app.getHttpServer())
      .post('/api/audit/events/')
      .set('authorization', `Bearer ${token}`)
      .send({})
      .expect(403);
  });
});
