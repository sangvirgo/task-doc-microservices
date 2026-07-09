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
    status?: string;
    deadline?: Date | null;
    blocked?: boolean;
    blockedReason?: string | null;
    previousStatus?: string | null;
  }): Promise<string> {
    const task = await prisma.task.create({
      data: {
        title: 'Task under test',
        description: 'Seeded task',
        status: options?.status ?? 'IN_PROGRESS',
        creator_id: options?.creatorId ?? EMPLOYEE_ID,
        assignee_id: options?.assigneeId ?? SECOND_EMPLOYEE_ID,
        parent_task_id: options?.parentTaskId ?? null,
        deadline: options?.deadline ?? null,
        blocked: options?.blocked ?? false,
        blocked_reason: options?.blockedReason ?? null,
        previous_status: options?.previousStatus ?? null,
      },
    });

    await prisma.taskParticipant.create({
      data: {
        task_id: task.id,
        user_id: options?.creatorId ?? EMPLOYEE_ID,
        role: 'CREATOR',
      },
    });

    if (
      (options?.assigneeId ?? SECOND_EMPLOYEE_ID) &&
      (options?.assigneeId ?? SECOND_EMPLOYEE_ID) !== (options?.creatorId ?? EMPLOYEE_ID)
    ) {
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
    const taskId = await seedTask({ status: 'WAITING_REVIEW' });
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
    const taskId = await seedTask({ status: 'WAITING_REVIEW' });
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

  it('rejects an invalid lifecycle transition', async () => {
    const taskId = await seedTask({ status: 'CREATED', assigneeId: EMPLOYEE_ID });

    const res = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/status`)
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(400);
  });

  it('allows NEED_REVISION to return to IN_PROGRESS', async () => {
    const taskId = await seedTask({ status: 'WAITING_REVIEW', assigneeId: SECOND_EMPLOYEE_ID });
    const submission = await prisma.taskSubmission.create({
      data: {
        task_id: taskId,
        author_id: SECOND_EMPLOYEE_ID,
        content: 'Needs revision',
        status: 'PENDING',
      },
    });

    const reviewRes = await request(app.getHttpServer())
      .post(`/tasks/submissions/${submission.id}/review`)
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ decision: 'NEED_REVISION', comment: 'Please revise' });

    expect(reviewRes.status).toBe(200);

    const res = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/status`)
      .set(authHeaders(SECOND_EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_PROGRESS');
  });

  it('denies parent approval while a child task is not APPROVED', async () => {
    const parentTaskId = await seedTask({
      status: 'WAITING_REVIEW',
      assigneeId: SECOND_EMPLOYEE_ID,
    });
    const parentSubmission = await prisma.taskSubmission.create({
      data: {
        task_id: parentTaskId,
        author_id: SECOND_EMPLOYEE_ID,
        content: 'Parent submission',
        status: 'PENDING',
      },
    });
    await seedTask({
      creatorId: SECOND_EMPLOYEE_ID,
      assigneeId: EMPLOYEE_ID,
      parentTaskId,
      status: 'IN_PROGRESS',
    });

    const res = await request(app.getHttpServer())
      .post(`/tasks/submissions/${parentSubmission.id}/review`)
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ approved: true, comment: 'Blocked by child' });

    expect(res.status).toBe(400);
  });

  it('allows parent approval after all child tasks are APPROVED', async () => {
    const parentTaskId = await seedTask({
      status: 'WAITING_REVIEW',
      assigneeId: SECOND_EMPLOYEE_ID,
    });
    const parentSubmission = await prisma.taskSubmission.create({
      data: {
        task_id: parentTaskId,
        author_id: SECOND_EMPLOYEE_ID,
        content: 'Parent submission',
        status: 'PENDING',
      },
    });
    await seedTask({
      creatorId: SECOND_EMPLOYEE_ID,
      assigneeId: EMPLOYEE_ID,
      parentTaskId,
      status: 'APPROVED',
    });

    const res = await request(app.getHttpServer())
      .post(`/tasks/submissions/${parentSubmission.id}/review`)
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ approved: true, comment: 'Approved' });

    expect(res.status).toBe(200);
    const parentTask = await prisma.task.findUniqueOrThrow({ where: { id: parentTaskId } });
    expect(parentTask.status).toBe('APPROVED');
  });

  it('blocks without replacing lifecycle status and unblocking restores the prior state', async () => {
    const taskId = await seedTask({ status: 'IN_PROGRESS', assigneeId: SECOND_EMPLOYEE_ID });

    const blockRes = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/block`)
      .set(authHeaders(SECOND_EMPLOYEE_ID, 'EMPLOYEE'))
      .send({ reason: 'Waiting on dependency' });

    expect(blockRes.status).toBe(200);
    expect(blockRes.body.status).toBe('IN_PROGRESS');
    expect(blockRes.body.blocked).toBe(true);
    expect(blockRes.body.blocked_reason).toBe('Waiting on dependency');

    const blockedTask = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(blockedTask.status).toBe('IN_PROGRESS');
    expect(blockedTask.previous_status).toBe('IN_PROGRESS');

    const unblockRes = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/unblock`)
      .set(authHeaders(SECOND_EMPLOYEE_ID, 'EMPLOYEE'));

    expect(unblockRes.status).toBe(200);
    expect(unblockRes.body.status).toBe('IN_PROGRESS');
    expect(unblockRes.body.blocked).toBe(false);
    expect(unblockRes.body.blocked_reason).toBeNull();

    const unblockedTask = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(unblockedTask.previous_status).toBeNull();
  });

  it('derives is_overdue and keeps it false for terminal tasks', async () => {
    const overdueTaskId = await seedTask({
      deadline: new Date('2026-07-27T00:00:00.000Z'),
      status: 'IN_PROGRESS',
    });
    const approvedTaskId = await seedTask({
      deadline: new Date('2026-07-27T00:00:00.000Z'),
      status: 'APPROVED',
    });

    const overdueRes = await request(app.getHttpServer())
      .get(`/tasks/${overdueTaskId}`)
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'));

    expect(overdueRes.status).toBe(200);
    expect(overdueRes.body.is_overdue).toBe(true);

    const approvedRes = await request(app.getHttpServer())
      .get(`/tasks/${approvedTaskId}`)
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'));

    expect(approvedRes.status).toBe(200);
    expect(approvedRes.body.is_overdue).toBe(false);
  });
});
