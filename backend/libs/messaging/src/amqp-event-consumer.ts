import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import amqp, { type AmqpConnectionManager, type ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage, Options } from 'amqplib';

import { eventEnvelopeSchema, type EventEnvelope } from '@c17/contracts';
import { StructuredLogger } from '@c17/observability';

import {
  DEAD_LETTER_EXCHANGE,
  DOMAIN_EXCHANGE,
  RETRY_EXCHANGE,
  deadLetterQueueName,
  deadLetterRoutingKey,
  retryQueueName,
} from './topology';

export interface EventConsumerOptions {
  consumer: string;
  concern: string;
  queue: string;
  routingKey: string;
  prefetch?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
}

@Injectable()
export class AmqpEventConsumer implements OnApplicationShutdown {
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;
  private shuttingDown = false;

  constructor(
    private readonly url: string,
    private readonly logger: StructuredLogger,
  ) {}

  subscribe(
    options: EventConsumerOptions,
    handler: (envelope: EventEnvelope, message: ConsumeMessage) => Promise<void>,
  ): void {
    if (!this.connection) {
      this.connection = amqp.connect([this.url]);
      this.connection.on('connect', () =>
        this.logger.log(
          `RabbitMQ consumer connected for ${options.consumer}.${options.concern}`,
          'AmqpEventConsumer',
        ),
      );
      this.connection.on('disconnect', ({ err }) =>
        this.logger.warn(
          `RabbitMQ consumer disconnected for ${options.consumer}.${options.concern}: ${err?.message ?? 'unknown'}`,
          'AmqpEventConsumer',
        ),
      );
    }

    const retryQueue = retryQueueName(options.queue);
    const dlq = deadLetterQueueName(options.queue);
    const prefetch = options.prefetch ?? 5;
    const retryDelayMs = options.retryDelayMs ?? 1_000;
    const maxAttempts = options.maxAttempts ?? 3;

    this.channel = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(DOMAIN_EXCHANGE, 'topic', { durable: true });
        await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'topic', { durable: true });
        await channel.assertExchange(RETRY_EXCHANGE, 'topic', { durable: true });

        await channel.assertQueue(options.queue, {
          durable: true,
          deadLetterExchange: DEAD_LETTER_EXCHANGE,
          deadLetterRoutingKey: deadLetterRoutingKey(options.queue),
        });
        await channel.bindQueue(options.queue, DOMAIN_EXCHANGE, options.routingKey);

        await channel.assertQueue(retryQueue, {
          durable: true,
          deadLetterExchange: DOMAIN_EXCHANGE,
        });
        await channel.bindQueue(retryQueue, RETRY_EXCHANGE, options.routingKey);

        await channel.assertQueue(dlq, { durable: true });
        await channel.bindQueue(dlq, DEAD_LETTER_EXCHANGE, deadLetterRoutingKey(options.queue));

        await channel.prefetch(prefetch);
        await channel.consume(options.queue, (message) => {
          void this.handleMessage(channel, options, handler, message, retryDelayMs, maxAttempts);
        });
      },
    });
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    await this.channel?.close();
    await this.connection?.close();
  }

  private async handleMessage(
    channel: ConfirmChannel,
    options: EventConsumerOptions,
    handler: (envelope: EventEnvelope, message: ConsumeMessage) => Promise<void>,
    message: ConsumeMessage | null,
    retryDelayMs: number,
    maxAttempts: number,
  ): Promise<void> {
    if (!message) return;

    const envelope = this.parseEnvelope(message, options);
    if (!envelope) {
      this.publishDeadLetter(channel, options.queue, message, 'invalid-envelope');
      channel.ack(message);
      return;
    }

    try {
      await handler(envelope, message);
      channel.ack(message);
    } catch (error) {
      const attempts = readAttemptCount(message) + 1;
      if (attempts >= maxAttempts) {
        this.logger.warn(
          {
            queue: options.queue,
            event_id: envelope.event_id,
            routing_key: message.fields.routingKey,
            attempts,
          },
          'AmqpEventConsumer',
        );
        if (this.shuttingDown) return;
        try {
          this.publishDeadLetter(
            channel,
            options.queue,
            message,
            error instanceof Error ? error.message : 'handler-failed',
          );
          channel.ack(message);
        } catch (publishError) {
          if (!this.shuttingDown) {
            this.logger.warn(
              `Unable to dead-letter ${options.queue}: ${publishError instanceof Error ? publishError.message : 'unknown'}`,
              'AmqpEventConsumer',
            );
          }
        }
        return;
      }

      if (this.shuttingDown) return;
      try {
        channel.publish(RETRY_EXCHANGE, message.fields.routingKey, message.content, {
          ...clonePublishProperties(message.properties),
          persistent: true,
          expiration: String(retryDelayMs),
          headers: {
            ...readHeaders(message.properties.headers),
            'x-retry-attempt': attempts,
          },
        });
        channel.ack(message);
      } catch (publishError) {
        if (!this.shuttingDown) {
          this.logger.warn(
            `Unable to retry ${options.queue}: ${publishError instanceof Error ? publishError.message : 'unknown'}`,
            'AmqpEventConsumer',
          );
        }
      }
    }
  }

  private parseEnvelope(
    message: ConsumeMessage,
    options: EventConsumerOptions,
  ): EventEnvelope | null {
    try {
      const parsed = eventEnvelopeSchema.safeParse(JSON.parse(message.content.toString('utf8')));
      if (!parsed.success) {
        this.logger.warn(
          {
            queue: options.queue,
            issues: parsed.error.issues,
          },
          'AmqpEventConsumer',
        );
        return null;
      }
      return parsed.data;
    } catch (error) {
      this.logger.warn(
        {
          queue: options.queue,
          error: error instanceof Error ? error.message : 'invalid-json',
        },
        'AmqpEventConsumer',
      );
      return null;
    }
  }

  private publishDeadLetter(
    channel: ConfirmChannel,
    queue: string,
    message: ConsumeMessage,
    failureReason: string,
  ): void {
    channel.publish(DEAD_LETTER_EXCHANGE, deadLetterRoutingKey(queue), message.content, {
      ...clonePublishProperties(message.properties),
      persistent: true,
      headers: {
        ...readHeaders(message.properties.headers),
        'x-failure-reason': failureReason,
      },
    });
  }
}

function readAttemptCount(message: ConsumeMessage): number {
  const value = readHeaders(message.properties.headers)['x-retry-attempt'];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function clonePublishProperties(properties: ConsumeMessage['properties']): Options.Publish {
  const publishOptions: Options.Publish = {};

  if (typeof properties.messageId === 'string') publishOptions.messageId = properties.messageId;
  if (typeof properties.correlationId === 'string') {
    publishOptions.correlationId = properties.correlationId;
  }
  if (typeof properties.contentType === 'string') {
    publishOptions.contentType = properties.contentType;
  }
  if (typeof properties.contentEncoding === 'string') {
    publishOptions.contentEncoding = properties.contentEncoding;
  }
  if (typeof properties.timestamp === 'number') publishOptions.timestamp = properties.timestamp;
  if (typeof properties.type === 'string') publishOptions.type = properties.type;
  if (typeof properties.appId === 'string') publishOptions.appId = properties.appId;

  const headers = readHeaders(properties.headers);
  if (Object.keys(headers).length > 0) {
    publishOptions.headers = headers;
  }

  return publishOptions;
}

function readHeaders(headers: unknown): Record<string, unknown> {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return {};
  }
  return { ...(headers as Record<string, unknown>) };
}
