import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { attachAuthContextFromHeaders } from '@c17/auth-context';
import { TaskPrismaService } from '../src/prisma/task-prisma.service';

type FetchResponseInit = {
  status?: number;
  json?: unknown;
};

type MockFetch = typeof fetch & jest.MockedFunction<typeof fetch>;

const EMPLOYEE_ID = '10000000-0000-4000-8000-000000000001';
const SECOND_EMPLOYEE_ID = '10000000-0000-4000-8000-000000000002';
const ADMIN_ID = '10000000-0000-4000-8000-000000000003';

function authHeaders(userId: string, role: 'EMPLOYEE' | 'ADMIN'): Record<string, string> {
  return {
    'x-user-id': userId,
    'x-user-role': role,
    'x-correlation-id': randomUUID(),
  };
}

function jsonResponse(init: FetchResponseInit): Response {
  return new Response(JSON.stringify(init.json ?? {}), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseJsonBody(body: RequestInit['body'] | null | undefined): unknown {
  if (typeof body !== 'string') {
    throw new Error('Expected JSON request body');
  }

  return JSON.parse(body);
}

describe('Task authorization integration (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: TaskPrismaService;
  let fetchMock: MockFetch;
  let permissionAvailable = true;
  let auditPayloads: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    process.env.MESSAGING_IN_MEMORY = 'true';
    process.env.USER_ROLE_SERVICE_URL = 'http://localhost:3002';

    const originalFetch = global.fetch;
    fetchMock = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/internal/permissions/check')) {
        if (!permissionAvailable) {
          throw new Error('permission service unavailable');
        }

        const payload = parseJsonBody(init?.body) as {
          actor_id: string;
          actor_role: 'EMPLOYEE' | 'ADMIN';
          action: string;
          resource_id: string;
          correlation_id: string;
        };

        const adminDeniedActions = new Set([
          'TASK_CREATE',
          'TASK_VIEW',
          'TASK_ASSIGN',
          'TASK_COMMENT',
          'TASK_SUBMIT',
          'TASK_REVIEW',
          'TASK_MODIFY',
        ]);

        if (payload.actor_role === 'ADMIN' && adminDeniedActions.has(payload.action)) {
          return jsonResponse({
            json: {
              allowed: false,
              reason_code: 'ADMIN_CONTENT_DENIED',
              effective_expires_at: null,
            },
          });
        }

        return jsonResponse({
          json: {
            allowed: true,
            reason_code: null,
            effective_expires_at: null,
          },
        });
      }

      if (url.endsWith('/audit/events')) {
        auditPayloads.push(parseJsonBody(init?.body) as Record<string, unknown>);
        return jsonResponse({ status: 201, json: { ok: true } });
      }

      if (url.includes('/users/')) {
        const userId = url.split('/users/')[1];
        const role =
          userId === ADMIN_ID
            ? 'ADMIN'
            : userId === EMPLOYEE_ID || userId === SECOND_EMPLOYEE_ID
              ? 'EMPLOYEE'
              : null;

        if (!role) {
          return jsonResponse({ status: 404, json: { message: 'User not found' } });
        }

        return jsonResponse({
          json: {
            id: userId,
            email: `${userId}@example.test`,
            role,
            locked_at: null,
            capabilities: [],
            created_at: new Date().toISOString(),
          },
        });
      }

      if (originalFetch) {
        return originalFetch(input, init);
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    global.fetch = fetchMock;

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(attachAuthContextFromHeaders);
    prisma = moduleRef.get(TaskPrismaService);
    await app.init();
  });

  beforeEach(async () => {
    permissionAvailable = true;
    auditPayloads = [];
    await prisma.taskActivity.deleteMany();
    await prisma.taskSubmission.deleteMany();
    await prisma.taskComment.deleteMany();
    await prisma.taskParticipant.deleteMany();
    await prisma.taskStatusHistory.deleteMany();
    await prisma.task.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedTask(options?: {
    creatorId?: string;
    assigneeId?: string | null;
    explicitParticipantId?: string;
    parentTaskId?: string | null;
  }): Promise<string> {
    const task = await prisma.task.create({
      data: {
        title: 'Task under test',
        description: 'Seeded task',
        status: 'IN_PROGRESS',
        creator_id: options?.creatorId ?? EMPLOYEE_ID,
        assignee_id: options?.assigneeId ?? SECOND_EMPLOYEE_ID,
        parent_task_id: options?.parentTaskId ?? null,
      },
    });

    await prisma.taskParticipant.create({
      data: {
        task_id: task.id,
        user_id: options?.creatorId ?? EMPLOYEE_ID,
        role: 'CREATOR',
      },
    });

    if (options?.assigneeId ?? SECOND_EMPLOYEE_ID) {
      await prisma.taskParticipant.create({
        data: {
          task_id: task.id,
          user_id: options?.assigneeId ?? SECOND_EMPLOYEE_ID,
          role: 'ASSIGNEE',
        },
      });
    }

    if (options?.explicitParticipantId) {
      await prisma.taskParticipant.create({
        data: {
          task_id: task.id,
          user_id: options.explicitParticipantId,
          role: 'PARTICIPANT',
        },
      });
    }

    return task.id;
  }

  it('denies ADMIN task creation', async () => {
    const res = await request(app.getHttpServer())
      .post('/tasks')
      .set(authHeaders(ADMIN_ID, 'ADMIN'))
      .send({ title: 'Forbidden admin task' });

    expect(res.status).toBe(403);
  });

  it('allows EMPLOYEE task creation with TASK_CREATE', async () => {
    const res = await request(app.getHttpServer())
      .post('/tasks')
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ title: 'Allowed employee task' });

    expect(res.status).toBe(201);
  });

  it('denies non-participant task detail view', async () => {
    const taskId = await seedTask();

    const res = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set(authHeaders(randomUUID(), 'EMPLOYEE'));

    expect(res.status).toBe(403);
  });

  it('allows direct participant task detail view', async () => {
    const taskId = await seedTask();

    const res = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(taskId);
  });

  it('denies assigning ADMIN as assignee', async () => {
    const taskId = await seedTask();

    const res = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/assign`)
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ assignee_id: ADMIN_ID });

    expect(res.status).toBe(400);
  });

  it('denies adding ADMIN as explicit participant', async () => {
    const taskId = await seedTask();

    const res = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/participants`)
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ user_id: ADMIN_ID });

    expect(res.status).toBe(400);
  });

  it('denies non-participant comment listing', async () => {
    const taskId = await seedTask();

    const res = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/comments`)
      .set(authHeaders(randomUUID(), 'EMPLOYEE'));

    expect(res.status).toBe(403);
  });

  it('denies non-participant comment creation and audits without comment content', async () => {
    const taskId = await seedTask();

    const res = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/comments`)
      .set(authHeaders(randomUUID(), 'EMPLOYEE'))
      .send({ content: 'Sensitive comment should never leak' });

    expect(res.status).toBe(403);
    expect(auditPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            action: 'TASK_COMMENT',
          }),
        }),
      ]),
    );
    expect(JSON.stringify(auditPayloads)).not.toContain('Sensitive comment should never leak');
  });

  it('allows direct participant comment list and create', async () => {
    const taskId = await seedTask();

    const createRes = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/comments`)
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ content: 'Visible to participants only' });

    expect(createRes.status).toBe(201);

    const listRes = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/comments`)
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'));

    expect(listRes.status).toBe(200);
    expect(listRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: 'Visible to participants only',
        }),
      ]),
    );
    expect(JSON.stringify(auditPayloads)).not.toContain('Visible to participants only');
  });

  it('denies non-participant task activity reads', async () => {
    const taskId = await seedTask();

    const res = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/activity`)
      .set(authHeaders(randomUUID(), 'EMPLOYEE'));

    expect(res.status).toBe(403);
  });

  it('allows direct participant task activity reads', async () => {
    const taskId = await seedTask();
    await prisma.taskActivity.create({
      data: {
        task_id: taskId,
        activity_type: 'COMMENT',
        actor_id: EMPLOYEE_ID,
        summary: 'Comment added: safe for participants',
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/activity`)
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activity_type: 'COMMENT',
        }),
      ]),
    );
  });

  it('allows current assignee to submit', async () => {
    const taskId = await seedTask();

    const res = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/submit`)
      .set(authHeaders(SECOND_EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ content: 'Submission content' });

    expect(res.status).toBe(201);
  });

  it('denies non-assignee submission', async () => {
    const taskId = await seedTask();

    const res = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/submit`)
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ content: 'Submission content' });

    expect(res.status).toBe(403);
  });

  it('allows task creator review', async () => {
    const taskId = await seedTask();
    const submission = await prisma.taskSubmission.create({
      data: {
        task_id: taskId,
        author_id: SECOND_EMPLOYEE_ID,
        content: 'Pending review',
        status: 'PENDING',
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/tasks/submissions/${submission.id}/review`)
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ approved: true, comment: 'Approved' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
  });

  it('denies non-creator review', async () => {
    const taskId = await seedTask();
    const submission = await prisma.taskSubmission.create({
      data: {
        task_id: taskId,
        author_id: SECOND_EMPLOYEE_ID,
        content: 'Pending review',
        status: 'PENDING',
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/tasks/submissions/${submission.id}/review`)
      .set(authHeaders(SECOND_EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ approved: true, comment: 'Nope' });

    expect(res.status).toBe(403);
  });

  it('allows child task creation only for the parent assignee', async () => {
    const parentTaskId = await seedTask({ assigneeId: SECOND_EMPLOYEE_ID });

    const denied = await request(app.getHttpServer())
      .post('/tasks')
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ title: 'Child denied', parent_task_id: parentTaskId });

    expect(denied.status).toBe(403);

    const allowed = await request(app.getHttpServer())
      .post('/tasks')
      .set(authHeaders(SECOND_EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ title: 'Child allowed', parent_task_id: parentTaskId });

    expect(allowed.status).toBe(201);
  });

  it('fails closed when permission service is unavailable', async () => {
    const taskId = await seedTask();
    permissionAvailable = false;

    const res = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'));

    expect(res.status).toBe(403);
  });
});
