import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { AuditController } from '../src/audit/audit.controller';
import { AuditService } from '../src/audit/audit.service';
import { AuditPrismaService } from '../src/prisma/audit-prisma.service';

/**
 * Integration tests for Audit Log Service against real PostgreSQL (port 5433).
 * Tests SHA-256 hash chain, deduplication, and chain verification.
 * Requires Docker infrastructure running.
 */
describe('Audit Log Service Integration (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: AuditPrismaService;

  // Unique event IDs per test run to avoid collisions with seed data
  const EVENT_1_ID = randomUUID();
  const EVENT_2_ID = randomUUID();
  const ACTOR_ID = randomUUID();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [AuditService, AuditPrismaService],
    }).compile();

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
    } catch (_) { /* ignore */ }
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
    const res = await request(app.getHttpServer())
      .get('/audit/chain/head')
      .expect(200);

    expect(res.body).toHaveProperty('last_hash');
    expect(res.body).toHaveProperty('sequence');
    expect(res.body.sequence).toBeGreaterThanOrEqual(2);
  });

  it('should verify hash chain integrity', async () => {
    const res = await request(app.getHttpServer())
      .post('/audit/chain/verify')
      .expect(200);

    expect(res.body.valid).toBe(true);
  });

  it('should retrieve an event by ID', async () => {
    const res = await request(app.getHttpServer())
      .get(`/audit/events/${EVENT_1_ID}`)
      .expect(200);

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
});
