import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import amqp from 'amqplib';
import { randomUUID } from 'crypto';

import { buildEventEnvelope, EventType } from '@c17/contracts';
import { DOMAIN_EXCHANGE } from '@c17/messaging';
import { loadLocalEnv } from '../../../test/load-local-env';

import { NotificationPrismaService } from '../src/prisma/notification-prisma.service';

describe('Notification event consumer integration (PostgreSQL + RabbitMQ)', () => {
  let app: INestApplication;
  let prisma: NotificationPrismaService;
  let connection: amqp.ChannelModel;
  let channel: amqp.Channel;
  let rabbitmqUrl: string;

  beforeAll(async () => {
    loadLocalEnv();
    rabbitmqUrl = requireEnv('RABBITMQ_URL');

    const moduleRef = await Test.createTestingModule({
      imports: [(await import('../src/app.module')).AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    prisma = moduleRef.get(NotificationPrismaService);
    await app.init();

    connection = await amqp.connect(rabbitmqUrl);
    channel = await connection.createChannel();
    await channel.assertExchange(DOMAIN_EXCHANGE, 'topic', { durable: true });
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.consumedEvent.deleteMany();
    await prisma.notificationPreference.deleteMany();
  });

  afterAll(async () => {
    await channel?.close();
    await connection?.close();
    await app.close();
  });

  it('consumes task.created and persists one in-app notification', async () => {
    const assigneeId = randomUUID();
    const taskId = randomUUID();

    const envelope = buildEventEnvelope({
      event_id: randomUUID(),
      event_type: EventType.TASK_CREATED,
      occurred_at: '2026-07-29T10:00:00.000Z',
      producer: 'task-management-service',
      correlation_id: randomUUID(),
      actor_id: randomUUID(),
      resource_type: 'TASK',
      resource_id: taskId,
      payload: {
        title: 'Quarterly review task',
        assignee_id: assigneeId,
        deadline: '2026-07-30T09:00:00.000Z',
      },
    });

    publishEnvelope(channel, envelope);

    await waitFor(async () => {
      const notifications = await prisma.notification.findMany({
        where: { recipient_id: assigneeId },
      });
      return notifications.length === 1;
    });

    const notifications = await prisma.notification.findMany({
      where: { recipient_id: assigneeId },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('TASK_ASSIGNED');

    const consumed = await prisma.consumedEvent.findUnique({
      where: { event_id: envelope.event_id },
    });
    expect(consumed).not.toBeNull();
  });

  it('does not duplicate notifications for the same event_id', async () => {
    const assigneeId = randomUUID();
    const taskId = randomUUID();

    const envelope = buildEventEnvelope({
      event_id: randomUUID(),
      event_type: EventType.TASK_CREATED,
      occurred_at: '2026-07-29T10:30:00.000Z',
      producer: 'task-management-service',
      correlation_id: randomUUID(),
      actor_id: randomUUID(),
      resource_type: 'TASK',
      resource_id: taskId,
      payload: {
        title: 'Duplicate delivery task',
        assignee_id: assigneeId,
        deadline: '2026-07-30T11:00:00.000Z',
      },
    });

    publishEnvelope(channel, envelope);
    publishEnvelope(channel, envelope);

    await waitFor(async () => {
      const notifications = await prisma.notification.findMany({
        where: { recipient_id: assigneeId },
      });
      return notifications.length === 1;
    });

    const notifications = await prisma.notification.findMany({
      where: { recipient_id: assigneeId },
    });
    expect(notifications).toHaveLength(1);
  });
});

function publishEnvelope(
  channel: amqp.Channel,
  envelope: ReturnType<typeof buildEventEnvelope>,
): void {
  channel.publish(DOMAIN_EXCHANGE, envelope.event_type, Buffer.from(JSON.stringify(envelope)), {
    persistent: true,
    contentType: 'application/json',
    messageId: envelope.event_id,
    correlationId: envelope.correlation_id,
  });
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
