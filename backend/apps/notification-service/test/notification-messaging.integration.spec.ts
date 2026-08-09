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

  it('notifies the configured reviewer when a task submission is created', async () => {
    const reviewerId = randomUUID();
    const taskId = randomUUID();
    const submissionId = randomUUID();
    const envelope = buildEventEnvelope({
      event_id: randomUUID(),
      event_type: EventType.TASK_SUBMITTED,
      occurred_at: '2026-08-09T10:00:00.000Z',
      producer: 'task-management-service',
      correlation_id: randomUUID(),
      actor_id: randomUUID(),
      resource_type: 'TASK_SUBMISSION',
      resource_id: submissionId,
      payload: {
        task_id: taskId,
        submission_id: submissionId,
        reviewer_id: reviewerId,
        title: 'Child task review',
      },
    });

    publishEnvelope(channel, envelope);
    await waitFor(async () => {
      return (await prisma.notification.count({ where: { recipient_id: reviewerId } })) === 1;
    });

    await expect(
      prisma.notification.findFirst({ where: { recipient_id: reviewerId } }),
    ).resolves.toEqual(
      expect.objectContaining({
        type: 'TASK_SUBMITTED_FOR_REVIEW',
        body: expect.stringContaining('Child task review'),
      }),
    );
  });

  it('notifies the submitter with the review decision without leaking review content', async () => {
    const authorId = randomUUID();
    const reviewComment = 'Internal reviewer note must not be published';
    const envelope = buildEventEnvelope({
      event_id: randomUUID(),
      event_type: EventType.TASK_REVIEWED,
      occurred_at: '2026-08-09T10:05:00.000Z',
      producer: 'task-management-service',
      correlation_id: randomUUID(),
      actor_id: randomUUID(),
      resource_type: 'TASK_SUBMISSION',
      resource_id: randomUUID(),
      payload: {
        task_id: randomUUID(),
        submission_id: randomUUID(),
        author_id: authorId,
        decision: 'NEED_REVISION',
        title: 'Child task review',
        review_comment: reviewComment,
      },
    });

    publishEnvelope(channel, envelope);
    await waitFor(async () => {
      return (await prisma.notification.count({ where: { recipient_id: authorId } })) === 1;
    });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { recipient_id: authorId },
    });
    expect(notification.type).toBe('TASK_REVIEWED');
    expect(notification.body).toContain('need revision');
    expect(notification.body).not.toContain(reviewComment);
  });

  it('consumes security.alert.created and persists one notification when only in-app is enabled', async () => {
    const actorId = randomUUID();
    await prisma.notificationPreference.create({
      data: {
        user_id: actorId,
        in_app_enabled: true,
        email_enabled: false,
      },
    });

    const envelope = buildEventEnvelope({
      event_id: randomUUID(),
      event_type: EventType.SECURITY_ALERT_CREATED,
      occurred_at: '2026-07-29T11:00:00.000Z',
      producer: 'security-monitoring-service',
      correlation_id: randomUUID(),
      actor_id: actorId,
      resource_type: 'SECURITY_ALERT',
      resource_id: randomUUID(),
      payload: {
        severity: 'HIGH',
        rule_type: 'FAILED_LOGIN',
        status: 'OPEN',
      },
    });

    publishEnvelope(channel, envelope);

    await waitFor(async () => {
      const notifications = await prisma.notification.findMany({
        where: { recipient_id: actorId },
      });
      return notifications.length === 1;
    });

    const notifications = await prisma.notification.findMany({
      where: { recipient_id: actorId },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('SECURITY_ALERT');
    expect(notifications[0].channel).toBe('IN_APP');
  });

  it('suppresses security alert notifications when every channel is disabled', async () => {
    const actorId = randomUUID();
    await prisma.notificationPreference.create({
      data: {
        user_id: actorId,
        in_app_enabled: false,
        email_enabled: false,
      },
    });

    const envelope = buildEventEnvelope({
      event_id: randomUUID(),
      event_type: EventType.SECURITY_ALERT_CREATED,
      occurred_at: '2026-07-29T11:05:00.000Z',
      producer: 'security-monitoring-service',
      correlation_id: randomUUID(),
      actor_id: actorId,
      resource_type: 'SECURITY_ALERT',
      resource_id: randomUUID(),
      payload: {
        severity: 'MEDIUM',
        rule_type: 'DENIED_CONTENT_ACCESS',
        status: 'OPEN',
      },
    });

    publishEnvelope(channel, envelope);

    await waitFor(async () => {
      const consumed = await prisma.consumedEvent.findUnique({
        where: { event_id: envelope.event_id },
      });
      return consumed !== null;
    });

    const notifications = await prisma.notification.findMany({
      where: { recipient_id: actorId },
    });
    expect(notifications).toHaveLength(0);
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
