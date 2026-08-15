import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { attachAuthContextFromHeaders } from '@c17/auth-context';

import { TaskOutboxRelayService } from '../src/messaging/task-outbox-relay.service';
import { TaskPrismaService } from '../src/prisma/task-prisma.service';

const EMPLOYEE_ID = '10000000-0000-4000-8000-000000000001';
const FOREIGN_ID = '20000000-0000-4000-8000-000000000002';
const ADMIN_ID = '30000000-0000-4000-8000-000000000003';

describe('task statistics integration', () => {
  let app: INestApplication;
  let prisma: TaskPrismaService;

  beforeAll(async () => {
    process.env.MESSAGING_IN_MEMORY = 'true';
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TaskOutboxRelayService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    app.use(attachAuthContextFromHeaders);
    prisma = moduleRef.get(TaskPrismaService);
    await app.init();
  });

  beforeEach(async () => {
    await prisma.taskActivity.deleteMany();
    await prisma.taskStatusHistory.deleteMany();
    await prisma.taskParticipant.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.task.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  function authHeaders(userId: string, role: 'EMPLOYEE' | 'ADMIN') {
    return { 'x-user-id': userId, 'x-user-role': role };
  }

  async function seedTask(input: {
    status: string;
    participantId: string;
    parentTaskId?: string;
    deadline?: Date;
    createdAt?: Date;
  }): Promise<string> {
    const task = await prisma.task.create({
      data: {
        title: `${input.status} task`,
        status: input.status,
        creator_id: input.participantId,
        assignee_id: input.participantId,
        parent_task_id: input.parentTaskId,
        deadline: input.deadline,
        created_at: input.createdAt ?? new Date('2026-08-03T10:00:00.000Z'),
      },
    });
    await prisma.taskParticipant.create({
      data: { task_id: task.id, user_id: input.participantId, role: 'ASSIGNEE' },
    });
    return task.id;
  }

  it('counts visible parent and child tasks by the eight current statuses', async () => {
    await seedTask({ status: 'IN_PROGRESS', participantId: EMPLOYEE_ID });
    const parentId = await seedTask({ status: 'APPROVED', participantId: EMPLOYEE_ID });
    await seedTask({
      status: 'NEED_REVISION',
      participantId: EMPLOYEE_ID,
      parentTaskId: parentId,
    });
    await seedTask({ status: 'APPROVED', participantId: FOREIGN_ID });

    const response = await request(app.getHttpServer())
      .get('/tasks/internal/statistics?scope=ME&from=2026-08-01&to=2026-08-10')
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'))
      .expect(200);

    expect(response.body.task_status).toMatchObject({
      IN_PROGRESS: 1,
      APPROVED: 1,
      NEED_REVISION: 1,
    });
    expect(response.body.summary.total_tasks).toBe(3);
    expect(response.body.summary.total_tasks).toBe(
      Object.values(response.body.task_status as Record<string, number>).reduce(
        (sum: number, count: number) => sum + count,
        0,
      ),
    );
  });

  it('counts only non-terminal overdue visible tasks', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await seedTask({ status: 'IN_PROGRESS', participantId: EMPLOYEE_ID, deadline: yesterday });
    await seedTask({ status: 'APPROVED', participantId: EMPLOYEE_ID, deadline: yesterday });
    await seedTask({ status: 'IN_PROGRESS', participantId: FOREIGN_ID, deadline: yesterday });

    const response = await request(app.getHttpServer())
      .get('/tasks/internal/statistics?scope=ME&from=2026-08-01&to=2026-08-10')
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'))
      .expect(200);

    expect(response.body.summary.overdue_tasks).toBe(1);
  });

  it('denies employees and includes foreign tasks for organization admins', async () => {
    await seedTask({ status: 'APPROVED', participantId: EMPLOYEE_ID });
    await seedTask({ status: 'REJECTED', participantId: FOREIGN_ID });

    await request(app.getHttpServer())
      .get('/tasks/internal/statistics?scope=ORGANIZATION&from=2026-08-01&to=2026-08-10')
      .set(authHeaders(EMPLOYEE_ID, 'EMPLOYEE'))
      .expect(403);

    const response = await request(app.getHttpServer())
      .get('/tasks/internal/statistics?scope=ORGANIZATION&from=2026-08-01&to=2026-08-10')
      .set(authHeaders(ADMIN_ID, 'ADMIN'))
      .expect(200);

    expect(response.body.summary.total_tasks).toBe(2);
    expect(response.body.task_status).toMatchObject({ APPROVED: 1, REJECTED: 1 });
  });
});
