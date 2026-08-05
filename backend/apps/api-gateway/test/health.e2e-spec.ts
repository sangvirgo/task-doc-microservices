import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { AppModule, SERVICE } from '../src/app.module';

describe('api-gateway health', () => {
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

  it('continues to JSON-forward ordinary requests', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'employee@c17.local', password: 'Employee123!' })
      .expect(201);

    expect(response.body).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.body).toBe(
      JSON.stringify({ email: 'employee@c17.local', password: 'Employee123!' }),
    );
    expect(init?.headers).toMatchObject({ 'content-type': 'application/json' });
    expect(new Headers(init?.headers).has('content-length')).toBe(false);
  });

  it('streams raw document uploads without JSON-serializing the body', async () => {
    fetchMock.mockImplementationOnce(async (_input, init) => {
      expect(init?.headers).toMatchObject({
        'content-type': 'application/octet-stream',
        'content-length': '11',
      });
      expect(typeof init?.body).not.toBe('string');

      const upstreamBody = init?.body as ReadableStream;
      const text = await new Response(upstreamBody).text();
      expect(text).toBe('hello world');

      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const token = jwtService.sign({
      sub: '10000000-0000-4000-8000-000000000001',
      role: 'EMPLOYEE',
      capabilities: [],
    });

    const response = await request(app.getHttpServer())
      .post('/api/documents/upload/raw')
      .set('authorization', `Bearer ${token}`)
      .set('content-type', 'application/octet-stream')
      .set('x-document-title', 'Memo')
      .set('x-document-type', 'MEMO')
      .set('x-document-owner-id', '10000000-0000-4000-8000-000000000001')
      .send(Buffer.from('hello world'))
      .expect(201);

    expect(response.body).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
