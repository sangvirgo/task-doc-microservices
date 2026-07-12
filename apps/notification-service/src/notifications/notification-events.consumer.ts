import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { EventType } from '@c17/contracts';
import { AmqpEventConsumer, queueName } from '@c17/messaging';
import { StructuredLogger } from '@c17/observability';

import { NotificationPrismaService } from '../prisma/notification-prisma.service';

@Injectable()
export class NotificationEventsConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly consumer: AmqpEventConsumer;

  constructor(
    private readonly prisma: NotificationPrismaService,
    logger: StructuredLogger,
  ) {
    this.consumer = new AmqpEventConsumer(
      process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
      logger,
    );
  }

  onModuleInit(): void {
    this.consumer.subscribe(
      {
        consumer: 'notification-service',
        concern: 'task-created',
        queue: queueName('notification-service', 'task-created'),
        routingKey: EventType.TASK_CREATED,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        await this.prisma.$transaction(async (tx) => {
          const existing = await tx.consumedEvent.findUnique({
            where: { event_id: event.event_id },
          });
          if (existing) {
            return;
          }

          const assigneeId = event.payload.assignee_id;
          if (typeof assigneeId === 'string') {
            const prefs = await tx.notificationPreference.upsert({
              where: { user_id: assigneeId },
              create: { user_id: assigneeId, email_enabled: true, in_app_enabled: true },
              update: {},
            });

            if (prefs.in_app_enabled) {
              await tx.notification.create({
                data: {
                  recipient_id: assigneeId,
                  type: 'TASK_ASSIGNED',
                  title: 'Task assigned',
                  body:
                    typeof event.payload.title === 'string'
                      ? `You were assigned task "${event.payload.title}".`
                      : 'You were assigned a task.',
                  channel: 'IN_APP',
                  metadata: {
                    task_id: event.resource_id,
                    correlation_id: event.correlation_id,
                  },
                },
              });
            }
          }

          await tx.consumedEvent.create({
            data: {
              event_id: event.event_id,
              event_type: event.event_type,
              resource_id: event.resource_id,
              metadata: {
                correlation_id: event.correlation_id,
              },
            },
          });
        });
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.consumer.onApplicationShutdown();
  }
}
