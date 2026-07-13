import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { EventType } from '@c17/contracts';
import { AmqpEventConsumer, queueName } from '@c17/messaging';
import { StructuredLogger } from '@c17/observability';
import type { Prisma } from '@prisma/client-security-monitoring';

import { SecurityMonitoringPrismaService } from '../prisma/security-monitoring-prisma.service';
import { MonitoringService } from './monitoring.service';

@Injectable()
export class MonitoringEventsConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly consumers: AmqpEventConsumer[];

  constructor(
    private readonly prisma: SecurityMonitoringPrismaService,
    private readonly monitoringService: MonitoringService,
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
    ];
  }

  onModuleInit(): void {
    this.consumers[0].subscribe(
      {
        consumer: 'security-monitoring-service',
        concern: 'permission-denied',
        queue: queueName('security-monitoring-service', 'permission-denied'),
        routingKey: EventType.PERMISSION_DECISION_MADE,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        if (!(await this.isUnconsumed(event.event_id))) {
          return;
        }

        await this.monitoringService.handlePermissionDenied({
          actor_id: event.actor_id,
          correlation_id: event.correlation_id,
          resource_id: event.resource_id,
          occurred_at: event.occurred_at,
          payload: event.payload,
        });
        await this.recordConsumed(event.event_id, event.event_type, event.resource_id, {
          correlation_id: event.correlation_id,
        });
      },
    );

    this.consumers[1].subscribe(
      {
        consumer: 'security-monitoring-service',
        concern: 'failed-login',
        queue: queueName('security-monitoring-service', 'failed-login'),
        routingKey: EventType.AUTH_LOGIN_FAILED,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        if (!(await this.isUnconsumed(event.event_id))) {
          return;
        }

        await this.monitoringService.handleRepeatedFailedLogin({
          actor_id: event.actor_id,
          correlation_id: event.correlation_id,
          resource_id: event.resource_id,
          occurred_at: event.occurred_at,
          payload: event.payload,
        });
        await this.recordConsumed(event.event_id, event.event_type, event.resource_id, {
          correlation_id: event.correlation_id,
        });
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.consumers.map((consumer) => consumer.onApplicationShutdown()));
  }

  private async isUnconsumed(eventId: string): Promise<boolean> {
    const existing = await this.prisma.consumedEvent.findUnique({
      where: { event_id: eventId },
    });
    return !existing;
  }

  private async recordConsumed(
    eventId: string,
    eventType: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.consumedEvent.create({
      data: {
        event_id: eventId,
        event_type: eventType,
        resource_id: resourceId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
