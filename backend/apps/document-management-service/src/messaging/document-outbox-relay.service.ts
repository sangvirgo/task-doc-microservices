import { Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';

import { EVENT_PUBLISHER, type EventPublisher } from '@c17/messaging';
import { StructuredLogger } from '@c17/observability';

import { DocumentPrismaService } from '../prisma/document-prisma.service';

const POLL_INTERVAL_MS = Number(process.env.OUTBOX_POLL_INTERVAL_MS || 1_000);
const RETRY_DELAY_MS = Number(process.env.OUTBOX_RETRY_DELAY_MS || 2_000);
const BATCH_SIZE = Number(process.env.OUTBOX_BATCH_SIZE || 20);

@Injectable()
export class DocumentOutboxRelayService implements OnModuleInit, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;
  private running = false;
  private activeFlush?: Promise<void>;

  constructor(
    private readonly prisma: DocumentPrismaService,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    private readonly logger: StructuredLogger,
  ) {}

  onModuleInit(): void {
    this.startFlush();
    this.timer = setInterval(() => this.startFlush(), POLL_INTERVAL_MS);
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
        `Document outbox relay failed: ${error instanceof Error ? error.message : 'unknown'}`,
        'DocumentOutboxRelayService',
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
        take: BATCH_SIZE,
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
              available_at: new Date(Date.now() + RETRY_DELAY_MS),
              last_error: limitError(error),
            },
          });
          this.logger.warn(
            {
              event_id: event.event_id,
              event_type: event.event_type,
              error: limitError(error),
            },
            'DocumentOutboxRelayService',
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
