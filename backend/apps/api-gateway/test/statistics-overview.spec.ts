import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

const EMPLOYEE_ID = '10000000-0000-4000-8000-000000000001';
const FOREIGN_ID = '20000000-0000-4000-8000-000000000002';

describe('statistics overview route', () => {
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

  function token(userId: string, role: 'EMPLOYEE' | 'ADMIN'): string {
    return jwtService.sign({ sub: userId, role, capabilities: [] });
  }

  it('rejects an employee organization request before downstream calls', async () => {
    await request(app.getHttpServer())
      .get('/api/statistics/overview?scope=ORGANIZATION&from=2026-08-01&to=2026-08-10')
      .set('authorization', `Bearer ${token(EMPLOYEE_ID, 'EMPLOYEE')}`)
      .expect(403);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'scope=ME&from=2026-08-01&to=2026-08-10&user_id=' + FOREIGN_ID,
    'scope=ME&from=2026-08-10&to=2026-08-01',
    'scope=ME&from=2026-08-01&to=2026-11-01',
    'scope=ME&from=2026-08-01&to=not-a-date',
  ])('rejects invalid overview query %s', async (query) => {
    await request(app.getHttpServer())
      .get(`/api/statistics/overview?${query}`)
      .set('authorization', `Bearer ${token(EMPLOYEE_ID, 'EMPLOYEE')}`)
      .expect(400);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/statistics/overview?scope=ME&from=2026-08-01&to=2026-08-10')
      .expect(401);
  });

});
