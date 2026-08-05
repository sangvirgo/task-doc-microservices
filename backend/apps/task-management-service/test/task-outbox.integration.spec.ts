import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';

import { EVENT_PUBLISHER, InMemoryEventPublisher } from '@c17/messaging';
import { loadLocalEnv } from '../../../test/load-local-env';

import { TaskPrismaService } from '../src/prisma/task-prisma.service';
import { TasksService } from '../src/tasks/tasks.service';

jest.setTimeout(20_000);

describe('Task outbox relay integration (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: TaskPrismaService;
  let tasksService: TasksService;
  let publisher: InMemoryEventPublisher;

  beforeAll(async () => {
    loadLocalEnv();
    process.env.MESSAGING_IN_MEMORY = 'true';
    process.env.OUTBOX_POLL_INTERVAL_MS = '50';
    process.env.OUTBOX_RETRY_DELAY_MS = '50';

    const moduleRef = await Test.createTestingModule({
      imports: [(await import('../src/app.module')).AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    prisma = moduleRef.get(TaskPrismaService);
    tasksService = moduleRef.get(TasksService);
    publisher = moduleRef.get<InMemoryEventPublisher>(EVENT_PUBLISHER);
    await prisma.$connect();
    await clearTaskData(prisma);
    await app.init();
  });

  beforeEach(async () => {
    publisher.clear();
    await clearTaskData(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('publishes a pending outbox event exactly once after task creation', async () => {
    const creatorId = randomUUID();
    const correlationId = randomUUID();

    const task = await tasksService.createTask({
      title: 'Outbox-backed task',
      creator_id: creatorId,
      assignee_id: creatorId,
      deadline: new Date('2026-07-30T09:00:00.000Z'),
      correlation_id: correlationId,
    });

    await waitFor(async () => {
      const row = await prisma.outboxEvent.findFirst({
        where: { resource_id: task.id, published_at: { not: null } },
      });
      return Boolean(row) && publisher.published.length === 1;
    }, 15_000);

    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0].event_type).toBe('task.created');
    expect(publisher.published[0].resource_id).toBe(task.id);

    const rows = await prisma.outboxEvent.findMany({
      where: { resource_id: task.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].published_at).not.toBeNull();
  });
});

async function clearTaskData(prisma: TaskPrismaService): Promise<void> {
  await prisma.outboxEvent.deleteMany();
  await prisma.taskParticipant.deleteMany();
  await prisma.task.deleteMany();
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}
