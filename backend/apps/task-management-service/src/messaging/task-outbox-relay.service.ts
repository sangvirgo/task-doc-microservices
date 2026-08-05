import { Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';

import { EVENT_PUBLISHER, type EventPublisher } from '@c17/messaging';
import { StructuredLogger } from '@c17/observability';

import { TaskPrismaService } from '../prisma/task-prisma.service';

@Injectable()
export class TaskOutboxRelayService implements OnModuleInit, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;
  private running = false;
  private activeFlush?: Promise<void>;
  private pollIntervalMs = 1_000;
  private retryDelayMs = 2_000;
  private batchSize = 20;

  constructor(
    private readonly prisma: TaskPrismaService,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    private readonly logger: StructuredLogger,
  ) {}

  onModuleInit(): void {
    this.pollIntervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS || 1_000);
    this.retryDelayMs = Number(process.env.OUTBOX_RETRY_DELAY_MS || 2_000);
    this.batchSize = Number(process.env.OUTBOX_BATCH_SIZE || 20);
    this.startFlush();
    this.timer = setInterval(() => this.startFlush(), this.pollIntervalMs);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    await this.activeFlush;
  }

  private startFlush(): void {
    if (this.running) return;
    this.activeFlush = this.flush().catch((error: unknown) => {
      this.logger.warn(
        `Task outbox relay failed: ${error instanceof Error ? error.message : 'unknown'}`,
        'TaskOutboxRelayService',
      );
    });
  }

  private async flush(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const events = await this.prisma.outboxEvent.findMany({
        where: {
          published_at: null,
          available_at: { lte: new Date() },
        },
        orderBy: { created_at: 'asc' },
        take: this.batchSize,
      });

      for (const event of events) {
        try {
          await this.publisher.publish({
            event_id: event.event_id,
            event_type: event.event_type,
            occurred_at: event.occurred_at.toISOString(),
            producer: event.producer,
            correlation_id: event.correlation_id,
            actor_id: event.actor_id,
            resource_type: event.resource_type,
            resource_id: event.resource_id,
            schema_version: event.schema_version,
            payload: event.payload as Record<string, unknown>,
          });

          await this.prisma.outboxEvent.updateMany({
            where: { id: event.id },
            data: {
              published_at: new Date(),
              attempts: { increment: 1 },
              last_error: null,
            },
          });
        } catch (error) {
          await this.prisma.outboxEvent.updateMany({
            where: { id: event.id },
            data: {
              attempts: { increment: 1 },
              available_at: new Date(Date.now() + this.retryDelayMs),
              last_error: limitError(error),
            },
          });
          this.logger.warn(
            {
              event_id: event.event_id,
              event_type: event.event_type,
              error: limitError(error),
            },
            'TaskOutboxRelayService',
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}

function limitError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown';
  return message.slice(0, 500);
}
