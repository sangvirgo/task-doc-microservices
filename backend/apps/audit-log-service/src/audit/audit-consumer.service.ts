import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';

import { AmqpEventConsumer, queueName } from '@c17/messaging';
import { StructuredLogger } from '@c17/observability';

import { AuditService } from './audit.service';

@Injectable()
export class AuditConsumerService implements OnModuleInit, OnApplicationShutdown {
  private readonly consumer: AmqpEventConsumer;

  constructor(
    private readonly auditService: AuditService,
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
        consumer: 'audit-log-service',
        concern: 'domain-events',
        queue: queueName('audit-log-service', 'domain-events'),
        routingKey: '#',
        prefetch: 1,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        // Noise filtering (preview page views, download tickets, list denials,
        // raw permission decisions, login/logout) lives in AuditService.appendEvent,
        // the single choke point for both the AMQP and HTTP append paths.
        await this.auditService.appendEvent({
          event_id: event.event_id,
          event_type: event.event_type,
          occurred_at: event.occurred_at,
          actor_id: event.actor_id,
          resource_type: event.resource_type,
          resource_id: event.resource_id,
          payload: event.payload,
        });
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.consumer.onApplicationShutdown();
  }
}
