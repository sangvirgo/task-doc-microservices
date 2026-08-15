import { Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import amqp, { type AmqpConnectionManager, type ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';

import type { EventEnvelope } from '@c17/contracts';
import { StructuredLogger } from '@c17/observability';

import type { EventPublisher } from './event-publisher';
import { DEAD_LETTER_EXCHANGE, DOMAIN_EXCHANGE } from './topology';

export const RABBITMQ_URL = Symbol('RABBITMQ_URL');

/**
 * Publishes to the domain exchange with publisher confirms, so `publish` resolves only once the
 * broker has accepted the message.
 *
 * Connection loss is handled by `amqp-connection-manager`, which buffers and re-establishes. That
 * buffer is not durability: a process that dies with unconfirmed messages loses them, which is why
 * events that must not be lost are published through the Outbox Pattern (V3 §8.2) rather than by
 * calling this directly.
 */
@Injectable()
export class AmqpEventPublisher implements EventPublisher, OnModuleInit, OnApplicationShutdown {
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

  constructor(
    @Inject(RABBITMQ_URL) private readonly url: string,
    private readonly logger: StructuredLogger,
  ) {}

  onModuleInit(): void {
    this.connection = amqp.connect([this.url]);
    this.connection.on('connect', () =>
      this.logger.log('RabbitMQ connected', 'AmqpEventPublisher'),
    );
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ disconnected: ${err?.message ?? 'unknown'}`, 'AmqpEventPublisher'),
    );

    this.channel = this.connection.createChannel({
      json: true,
      confirm: true,
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(DOMAIN_EXCHANGE, 'topic', { durable: true });
        await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'topic', { durable: true });
      },
    });
  }

  async publish(envelope: EventEnvelope): Promise<void> {
    if (!this.channel) {
      throw new Error('AmqpEventPublisher used before onModuleInit');
    }

    await this.channel.publish(DOMAIN_EXCHANGE, envelope.event_type, envelope, {
      persistent: true,
      messageId: envelope.event_id,
      correlationId: envelope.correlation_id,
      contentType: 'application/json',
      timestamp: Date.parse(envelope.occurred_at),
    });
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.channel?.close();
    } catch {
      // Best-effort shutdown: a late broker/channel close during process teardown is non-fatal.
    }

    try {
      await this.connection?.close();
    } catch {
      // Best-effort shutdown: a late broker/channel close during process teardown is non-fatal.
    }
  }
}
