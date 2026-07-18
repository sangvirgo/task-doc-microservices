import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import amqp from 'amqplib';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { buildEventEnvelope, EventType } from '@c17/contracts';
import {
  DEAD_LETTER_EXCHANGE,
  DOMAIN_EXCHANGE,
  deadLetterQueueName,
  deadLetterRoutingKey,
  queueName,
  retryQueueName,
  RETRY_EXCHANGE,
} from '@c17/messaging';
import { loadLocalEnv } from '../../../test/load-local-env';

import { AuditPrismaService } from '../src/prisma/audit-prisma.service';

/**
 * Integration tests for Audit Log Service against real PostgreSQL (port 5433).
 * Tests SHA-256 hash chain, deduplication, and chain verification.
 * Requires Docker infrastructure running.
 */
describe('Audit Log Service Integration (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: AuditPrismaService;
  let connection: amqp.ChannelModel;
  let channel: amqp.Channel;
  let rabbitmqUrl: string;
  const auditQueue = queueName('audit-log-service', 'domain-events');
  const auditRetryQueue = retryQueueName(auditQueue);
  const auditDlq = deadLetterQueueName(auditQueue);

  // Unique event IDs per test run to avoid collisions with seed data
  const EVENT_1_ID = randomUUID();
  const EVENT_2_ID = randomUUID();
  const ACTOR_ID = randomUUID();

  beforeAll(async () => {
    loadLocalEnv();
    rabbitmqUrl = requireEnv('RABBITMQ_URL');
    const moduleRef = await Test.createTestingModule({
      imports: [(await import('../src/app.module')).AppModule],
    }).compile();

    connection = await amqp.connect(rabbitmqUrl);
    channel = await connection.createChannel();
    await channel.assertExchange(DOMAIN_EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(RETRY_EXCHANGE, 'topic', { durable: true });
    await channel.assertQueue(auditQueue, {
      durable: true,
      deadLetterExchange: DEAD_LETTER_EXCHANGE,
      deadLetterRoutingKey: deadLetterRoutingKey(auditQueue),
    });
    await channel.bindQueue(auditQueue, DOMAIN_EXCHANGE, '#');
    await channel.assertQueue(auditRetryQueue, {
      durable: true,
      deadLetterExchange: DOMAIN_EXCHANGE,
    });
    await channel.bindQueue(auditRetryQueue, RETRY_EXCHANGE, '#');
    await channel.assertQueue(auditDlq, { durable: true });
    await channel.bindQueue(auditDlq, DEAD_LETTER_EXCHANGE, deadLetterRoutingKey(auditQueue));
    await channel.purgeQueue(auditQueue);
    await channel.purgeQueue(auditRetryQueue);
    await channel.purgeQueue(auditDlq);

    app = moduleRef.createNestApplication();
    prisma = moduleRef.get(AuditPrismaService);
    await app.init();

    // Reset audit chain for a clean test run
    await prisma.auditEvent.deleteMany();
    await prisma.chainHead.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', last_hash: '', sequence: 0 },
      update: { last_hash: '', last_event_id: null, sequence: 0 },
    });
  });

  afterAll(async () => {
    // Clean up test events
    try {
      await prisma.auditEvent.deleteMany({
        where: { id: { in: [EVENT_1_ID, EVENT_2_ID] } },
      });
    } catch {
      /* ignore */
    }
    await channel?.close();
    await connection?.close();
    await app.close();
  });

  it('should append an audit event with hash chain (V3 §5.7)', async () => {
    const res = await request(app.getHttpServer())
      .post('/audit/events')
      .send({
        event_id: EVENT_1_ID,
        event_type: 'document.accessed',
        occurred_at: new Date().toISOString(),
        actor_id: ACTOR_ID,
        resource_type: 'DOCUMENT',
        resource_id: randomUUID(),
        payload: { action: 'PREVIEW', success: true },
      })
      .expect(201);

    expect(res.body).toHaveProperty('current_hash');
    expect(res.body).toHaveProperty('sequence_number');
    expect(typeof res.body.current_hash).toBe('string');
    expect(res.body.current_hash.length).toBe(64); // SHA-256 hex

    // Verify in PostgreSQL
    const dbEvent = await prisma.auditEvent.findUnique({ where: { id: EVENT_1_ID } });
    expect(dbEvent).not.toBeNull();
    expect(dbEvent!.current_hash).toBe(res.body.current_hash);
  });

  it('should build a hash chain across multiple events', async () => {
    const res = await request(app.getHttpServer())
      .post('/audit/events')
      .send({
        event_id: EVENT_2_ID,
        event_type: 'permission.granted',
        occurred_at: new Date().toISOString(),
        actor_id: ACTOR_ID,
        resource_type: 'GRANT',
        resource_id: randomUUID(),
        payload: { permissions: ['PREVIEW'] },
      })
      .expect(201);

    expect(res.body.sequence_number).toBeGreaterThan(0);

    // The second event's previous_hash should reference a prior hash
    const dbEvent2 = await prisma.auditEvent.findUnique({ where: { id: EVENT_2_ID } });
    expect(dbEvent2!.previous_hash).toBeDefined();
    expect(dbEvent2!.previous_hash.length).toBe(64);
  });

  it('should deduplicate on event_id (ADR-0002)', async () => {
    const firstRes = await request(app.getHttpServer())
      .post('/audit/events')
      .send({
        event_id: EVENT_1_ID,
        event_type: 'document.accessed',
        occurred_at: new Date().toISOString(),
        actor_id: ACTOR_ID,
        resource_type: 'DOCUMENT',
        resource_id: randomUUID(),
        payload: { action: 'PREVIEW', success: true },
      })
      .expect(201);

    // Same hash and sequence as original — deduplicated
    const dbEvent = await prisma.auditEvent.findUnique({ where: { id: EVENT_1_ID } });
    expect(firstRes.body.current_hash).toBe(dbEvent!.current_hash);
  });

  it('should retrieve the chain head', async () => {
    const res = await request(app.getHttpServer()).get('/audit/chain/head').expect(200);

    expect(res.body).toHaveProperty('last_hash');
    expect(res.body).toHaveProperty('sequence');
    expect(res.body.sequence).toBeGreaterThanOrEqual(2);
  });

  it('should verify hash chain integrity', async () => {
    const res = await request(app.getHttpServer()).post('/audit/chain/verify').expect(200);

    expect(res.body.valid).toBe(true);
  });

  it('should retrieve an event by ID', async () => {
    const res = await request(app.getHttpServer()).get(`/audit/events/${EVENT_1_ID}`).expect(200);

    expect(res.body.id).toBe(EVENT_1_ID);
    expect(res.body.event_type).toBe('document.accessed');
  });

  it('should list events filtered by actor_id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/audit/events?actor_id=${ACTOR_ID}`)
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(2);
    for (const event of res.body) {
      expect(event.actor_id).toBe(ACTOR_ID);
    }
  });

  it('does not fork the chain on duplicate RabbitMQ delivery', async () => {
    const eventId = randomUUID();
    const resourceId = randomUUID();
    const before = await prisma.auditEvent.count();

    const envelope = buildEventEnvelope({
      event_id: eventId,
      event_type: EventType.TASK_CREATED,
      occurred_at: '2026-07-29T09:30:00.000Z',
      producer: 'task-management-service',
      correlation_id: randomUUID(),
      actor_id: ACTOR_ID,
      resource_type: 'TASK',
      resource_id: resourceId,
      payload: { title: 'Rabbit audit event', assignee_id: ACTOR_ID },
    });

    const payload = Buffer.from(JSON.stringify(envelope));
    channel.publish(DOMAIN_EXCHANGE, envelope.event_type, payload, {
      persistent: true,
      contentType: 'application/json',
      messageId: envelope.event_id,
      correlationId: envelope.correlation_id,
    });
    channel.publish(DOMAIN_EXCHANGE, envelope.event_type, payload, {
      persistent: true,
      contentType: 'application/json',
      messageId: envelope.event_id,
      correlationId: envelope.correlation_id,
    });

    await waitFor(async () => {
      const event = await prisma.auditEvent.findUnique({ where: { id: eventId } });
      return Boolean(event);
    });

    const after = await prisma.auditEvent.count();
    expect(after).toBe(before + 1);

    const event = await prisma.auditEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(event.sequence_number).toBeGreaterThan(0);

    const integrity = await request(app.getHttpServer()).post('/audit/chain/verify').expect(200);
    expect(integrity.body).toEqual({ valid: true });
  });
});

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
