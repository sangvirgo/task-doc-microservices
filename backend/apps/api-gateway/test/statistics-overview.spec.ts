import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { AppModule } from '../src/app.module';

const EMPLOYEE_ID = '10000000-0000-4000-8000-000000000001';
const ADMIN_ID = '10000000-0000-4000-8000-000000000003';
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

  function requestUrl(input: string | URL | Request): string {
    return typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
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

  function overviewResponse(url: string): Response {
    if (url.includes('/tasks/internal/statistics')) {
      return new Response(
        JSON.stringify({
          summary: {
            total_tasks: 3,
            in_progress_tasks: 1,
            approved_tasks: 1,
            overdue_tasks: 1,
          },
          task_status: {
            CREATED: 0,
            ASSIGNED: 0,
            IN_PROGRESS: 1,
            WAITING_REVIEW: 0,
            APPROVED: 1,
            NEED_REVISION: 1,
            REJECTED: 0,
            CANCELLED: 0,
          },
          task_trend: [{ date: '2026-08-03', created: 3, completed: 1 }],
          recent_activity: [
            {
              id: 'activity-1',
              type: 'TASK_ASSIGNED',
              message: 'Task assigned',
              created_at: '2026-08-03T10:00:00.000Z',
            },
          ],
          organization_tasks: { total: 3, approved: 1, overdue: 1 },
          growth_trend: [{ date: '2026-08-03', tasks: 3 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/documents/internal/statistics')) {
      return new Response(
        JSON.stringify({ visible_documents: 2, task_documents: 1, eligible_documents: 1 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/monitoring/internal/statistics')) {
      return new Response(JSON.stringify({ security_alerts: 2, open_alerts: 2 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/users/internal/statistics')) {
      return new Response(
        JSON.stringify({
          users: { total: 128, active_employees: 116, locked_users: 4 },
          growth_trend: [{ date: '2026-08-03', users: 128 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/audit/chain/verify')) {
      return new Response(JSON.stringify({ valid: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }

  it('returns ME metrics for the JWT caller without organization fields', async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = requestUrl(input);
      const headers = new Headers(init?.headers);
      expect(headers.get('x-user-id')).toBe(EMPLOYEE_ID);
      expect(headers.get('x-user-role')).toBe('EMPLOYEE');
      expect(url).not.toContain('user_id=');
      return Promise.resolve(overviewResponse(url));
    });

    const response = await request(app.getHttpServer())
      .get('/api/statistics/overview?scope=ME&from=2026-08-01&to=2026-08-10')
      .set('authorization', `Bearer ${token(EMPLOYEE_ID, 'EMPLOYEE')}`)
      .expect(200);

    expect(response.body).toMatchObject({
      scope: 'ME',
      range: { from: '2026-08-01', to: '2026-08-10' },
      summary: {
        total_tasks: 3,
        visible_documents: 2,
        task_documents: 1,
        security_alerts: 2,
      },
      task_status: expect.objectContaining({ WAITING_REVIEW: 0, NEED_REVISION: 1 }),
    });
    expect(response.body.users).toBeUndefined();
    expect(response.body.organization_tasks).toBeUndefined();
  });

  it('returns organization metrics only for an admin', async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = requestUrl(input);
      const headers = new Headers(init?.headers);
      expect(headers.get('x-user-id')).toBe(ADMIN_ID);
      expect(headers.get('x-user-role')).toBe('ADMIN');
      if (url.includes('/audit/chain/verify')) expect(init?.method).toBe('POST');
      return Promise.resolve(overviewResponse(url));
    });

    const response = await request(app.getHttpServer())
      .get('/api/statistics/overview?scope=ORGANIZATION&from=2026-08-01&to=2026-08-10')
      .set('authorization', `Bearer ${token(ADMIN_ID, 'ADMIN')}`)
      .expect(200);

    expect(response.body.users).toEqual({ total: 128, active_employees: 116, locked_users: 4 });
    expect(response.body.organization_tasks).toEqual({ total: 3, approved: 1, overdue: 1 });
    expect(response.body.security).toEqual({ open_alerts: 2, audit_chain: 'VALID' });
    expect(response.body.retention).toEqual({ eligible_documents: 1 });
    expect(response.body.growth_trend).toEqual([{ date: '2026-08-03', users: 128, tasks: 3 }]);
  });

  it('fails closed when a downstream service is unavailable', async () => {
    fetchMock.mockRejectedValue(new Error('task service unavailable'));

    await request(app.getHttpServer())
      .get('/api/statistics/overview?scope=ME&from=2026-08-01&to=2026-08-10')
      .set('authorization', `Bearer ${token(EMPLOYEE_ID, 'EMPLOYEE')}`)
      .expect(503);
  });
});
