import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { EventType } from '@c17/contracts';
import { AmqpEventConsumer, queueName } from '@c17/messaging';
import { StructuredLogger } from '@c17/observability';
import type { Prisma } from '@prisma/client-notification';

import { NotificationPrismaService } from '../prisma/notification-prisma.service';

@Injectable()
export class NotificationEventsConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly consumers: AmqpEventConsumer[];

  constructor(
    private readonly prisma: NotificationPrismaService,
    logger: StructuredLogger,
  ) {
    this.consumers = [
      new AmqpEventConsumer(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
        logger,
      ),
      new AmqpEventConsumer(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
        logger,
      ),
      new AmqpEventConsumer(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
        logger,
      ),
      new AmqpEventConsumer(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
        logger,
      ),
    ];
  }

  onModuleInit(): void {
    this.consumers[0].subscribe(
      {
        consumer: 'notification-service',
        concern: 'task-created',
        queue: queueName('notification-service', 'task-created'),
        routingKey: EventType.TASK_CREATED,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        await this.createNotificationsForEvent({
          eventId: event.event_id,
          eventType: event.event_type,
          resourceId: event.resource_id,
          recipientId:
            typeof event.payload.assignee_id === 'string' ? event.payload.assignee_id : null,
          channels: {
            inApp: true,
            email: false,
          },
          notificationType: 'TASK_ASSIGNED',
          title: 'Task assigned',
          body:
            typeof event.payload.title === 'string'
              ? `You were assigned task "${event.payload.title}".`
              : 'You were assigned a task.',
          metadata: {
            task_id: event.resource_id,
            correlation_id: event.correlation_id,
          },
        });
      },
    );

    this.consumers[1].subscribe(
      {
        consumer: 'notification-service',
        concern: 'session-revoked',
        queue: queueName('notification-service', 'session-revoked'),
        routingKey: EventType.AUTH_SESSION_REVOKED,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        await this.createNotificationsForEvent({
          eventId: event.event_id,
          eventType: event.event_type,
          resourceId: event.resource_id,
          recipientId: event.actor_id,
          channels: {
            inApp: true,
            email: true,
          },
          notificationType: 'SECURITY_SESSION_REVOKED',
          title: 'Session revoked',
          body:
            event.payload.reason_code === 'SECURITY_LOCK'
              ? 'Your active sessions were revoked due to a security lock.'
              : 'Your session was revoked.',
          metadata: {
            correlation_id: event.correlation_id,
            reason_code:
              typeof event.payload.reason_code === 'string' ? event.payload.reason_code : null,
          },
        });
      },
    );

    this.consumers[2].subscribe(
      {
        consumer: 'notification-service',
        concern: 'security-alert-created',
        queue: queueName('notification-service', 'security-alert-created'),
        routingKey: EventType.SECURITY_ALERT_CREATED,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        await this.createNotificationsForEvent({
          eventId: event.event_id,
          eventType: event.event_type,
          resourceId: event.resource_id,
          recipientId: event.actor_id,
          channels: {
            inApp: true,
            email: true,
          },
          notificationType: 'SECURITY_ALERT',
          title: 'Security alert',
          body: 'A security alert was raised on your account activity.',
          metadata: {
            correlation_id: event.correlation_id,
            severity: typeof event.payload.severity === 'string' ? event.payload.severity : null,
            rule_type: typeof event.payload.rule_type === 'string' ? event.payload.rule_type : null,
            alert_id: event.resource_id,
          },
        });
      },
    );

    this.consumers[3].subscribe(
      {
        consumer: 'notification-service',
        concern: 'grant-expired',
        queue: queueName('notification-service', 'grant-expired'),
        routingKey: EventType.PERMISSION_GRANT_EXPIRED,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        await this.createNotificationsForEvent({
          eventId: event.event_id,
          eventType: event.event_type,
          resourceId: event.resource_id,
          recipientId: event.actor_id,
          channels: {
            inApp: true,
            email: true,
          },
          notificationType: 'GRANT_EXPIRED',
          title: 'Document access expired',
          body: 'A document access grant has expired.',
          metadata: {
            correlation_id: event.correlation_id,
            grant_id: typeof event.payload.grant_id === 'string' ? event.payload.grant_id : null,
            effective_expires_at:
              typeof event.payload.effective_expires_at === 'string'
                ? event.payload.effective_expires_at
                : null,
          },
        });
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.consumers.map((consumer) => consumer.onApplicationShutdown()));
  }

  private async createNotificationsForEvent(input: {
    eventId: string;
    eventType: string;
    resourceId: string;
    recipientId: string | null;
    channels: {
      inApp: boolean;
      email: boolean;
    };
    notificationType: string;
    title: string;
    body: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.consumedEvent.findUnique({
        where: { event_id: input.eventId },
      });
      if (existing) {
        return;
      }

      if (input.recipientId) {
        const prefs = await tx.notificationPreference.upsert({
          where: { user_id: input.recipientId },
          create: { user_id: input.recipientId, email_enabled: true, in_app_enabled: true },
          update: {},
        });

        const rows: Prisma.NotificationCreateManyInput[] = [];
        if (input.channels.inApp && prefs.in_app_enabled) {
          rows.push({
            recipient_id: input.recipientId,
            type: input.notificationType,
            title: input.title,
            body: input.body,
            channel: 'IN_APP',
            metadata: input.metadata as Prisma.InputJsonValue,
          });
        }
        if (input.channels.email && prefs.email_enabled) {
          rows.push({
            recipient_id: input.recipientId,
            type: input.notificationType,
            title: input.title,
            body: input.body,
            channel: 'EMAIL',
            metadata: input.metadata as Prisma.InputJsonValue,
          });
        }

        if (rows.length > 0) {
          await tx.notification.createMany({ data: rows });
        }
      }

      await tx.consumedEvent.create({
        data: {
          event_id: input.eventId,
          event_type: input.eventType,
          resource_id: input.resourceId,
          metadata: input.metadata as Prisma.InputJsonValue,
        },
      });
    });
  }
}
