import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { EventType } from '@c17/contracts';
import { AmqpEventConsumer, queueName } from '@c17/messaging';
import { StructuredLogger } from '@c17/observability';

import { PermissionPrismaService } from '../prisma/permission-prisma.service';
import { PermissionService } from './permission.service';

@Injectable()
export class PermissionEventsConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly consumer: AmqpEventConsumer;

  constructor(
    private readonly prisma: PermissionPrismaService,
    private readonly permissionService: PermissionService,
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
        consumer: 'permission-service',
        concern: 'task-deadline-changed',
        queue: queueName('permission-service', 'task-deadline-changed'),
        routingKey: EventType.TASK_DEADLINE_CHANGED,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        const deadline = event.payload.deadline;
        if (typeof deadline !== 'string') {
          throw new Error('task.deadline.changed payload.deadline must be an ISO string');
        }

        const parsedDeadline = new Date(deadline);
        if (Number.isNaN(parsedDeadline.getTime())) {
          throw new Error('task.deadline.changed payload.deadline is invalid');
        }

        await this.permissionService.handleTaskDeadlineChanged(event.resource_id, parsedDeadline);

        await this.prisma.consumedEvent
          .create({
            data: {
              event_id: event.event_id,
              event_type: event.event_type,
              resource_id: event.resource_id,
              metadata: {
                correlation_id: event.correlation_id,
              },
            },
          })
          .catch((error: { code?: string }) => {
            if (error?.code === 'P2002') {
              return null;
            }
            throw error;
          });
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.consumer.onApplicationShutdown();
  }
}
