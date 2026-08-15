import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import amqp from 'amqplib';
import { randomUUID } from 'crypto';

import { buildEventEnvelope, EventType } from '@c17/contracts';
import {
  DEAD_LETTER_EXCHANGE,
  DOMAIN_EXCHANGE,
  deadLetterQueueName,
  queueName,
  retryQueueName,
} from '@c17/messaging';
import { loadLocalEnv } from '../../../test/load-local-env';

describe('Permission event consumer integration (RabbitMQ)', () => {
  let app: INestApplication;
  let connection: amqp.ChannelModel;
  let channel: amqp.Channel;
  let rabbitmqUrl: string;

  const queue = queueName('permission-service', 'task-deadline-changed');
  const retryQueue = retryQueueName(queue);
  const dlq = deadLetterQueueName(queue);

  beforeAll(async () => {
    loadLocalEnv();
    rabbitmqUrl = requireEnv('RABBITMQ_URL');

    const moduleRef = await Test.createTestingModule({
      imports: [(await import('../src/app.module')).AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    connection = await amqp.connect(rabbitmqUrl);
    channel = await connection.createChannel();
    await channel.assertExchange(DOMAIN_EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'topic', { durable: true });
    await channel.checkQueue(queue);
    await channel.checkQueue(retryQueue);
    await channel.checkQueue(dlq);
  });

  beforeEach(async () => {
    await channel.purgeQueue(queue).catch(() => undefined);
    await channel.purgeQueue(retryQueue).catch(() => undefined);
    await channel.purgeQueue(dlq).catch(() => undefined);
  });

  afterAll(async () => {
    await channel?.close();
    await connection?.close();
    await app.close();
  });

  it('retries a failing event and dead-letters it after retry exhaustion', async () => {
    const envelope = buildEventEnvelope({
      event_id: randomUUID(),
      event_type: EventType.TASK_DEADLINE_CHANGED,
      occurred_at: '2026-07-29T11:00:00.000Z',
      producer: 'task-management-service',
      correlation_id: randomUUID(),
      actor_id: randomUUID(),
      resource_type: 'TASK',
      resource_id: randomUUID(),
      payload: {
        deadline: 'not-a-real-date',
      },
    });

    channel.publish(DOMAIN_EXCHANGE, envelope.event_type, Buffer.from(JSON.stringify(envelope)), {
      persistent: true,
      contentType: 'application/json',
      messageId: envelope.event_id,
      correlationId: envelope.correlation_id,
    });

    const deadLetter = await waitForDeadLetter(channel, dlq, 12_000);
    if (!deadLetter) {
      throw new Error('Expected a dead-lettered message');
    }

    const parsed = JSON.parse(deadLetter.content.toString('utf8')) as { event_id: string };
    expect(parsed.event_id).toBe(envelope.event_id);
  });
});

async function waitForDeadLetter(
  channel: amqp.Channel,
  queueName: string,
  timeoutMs: number,
): Promise<amqp.GetMessage | false> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const message = await channel.get(queueName, { noAck: false });
    if (message) {
      channel.ack(message);
      return message;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
