import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { PermissionsController } from '../src/permissions/permissions.controller';
import { PermissionService } from '../src/permissions/permission.service';
import { PermissionPrismaService } from '../src/prisma/permission-prisma.service';

/**
 * Integration tests for Permission Service against real PostgreSQL (port 5433).
 * Requires Docker infrastructure running.
 */
describe('Permission Service Integration (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PermissionPrismaService;
  let permissionService: PermissionService;

  const ACTOR_ID = randomUUID();
  const GRANTOR_ID = randomUUID();
  const RESOURCE_ID = randomUUID();
  const TASK_ID = randomUUID();
  let grantId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [PermissionService, PermissionPrismaService],
    }).compile();

    app = moduleRef.createNestApplication();
    prisma = moduleRef.get(PermissionPrismaService);
    permissionService = moduleRef.get(PermissionService);
    await app.init();
  });

  afterAll(async () => {
    // Clean up test grants
    try {
      await prisma.grant.deleteMany({
        where: { OR: [{ actor_id: ACTOR_ID }, { grantor_id: GRANTOR_ID }] },
      });
    } catch {
      /* ignore */
    }
    await app.close();
  });

  it('should create a grant in PostgreSQL', async () => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app.getHttpServer())
      .post('/grants')
      .send({
        grantor_id: GRANTOR_ID,
        actor_id: ACTOR_ID,
        resource_type: 'DOCUMENT',
        resource_id: RESOURCE_ID,
        permissions: ['PREVIEW', 'DOWNLOAD'],
        task_id: TASK_ID,
        expires_at: expiresAt,
      })
      .expect(201);

    grantId = res.body.id;
    expect(res.body.actor_id).toBe(ACTOR_ID);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.permissions).toEqual(['PREVIEW', 'DOWNLOAD']);

    // Verify in PostgreSQL directly
    const dbGrant = await prisma.grant.findUnique({ where: { id: grantId } });
    expect(dbGrant).not.toBeNull();
    expect(dbGrant!.actor_id).toBe(ACTOR_ID);
  });

  it('should retrieve the grant by ID', async () => {
    const res = await request(app.getHttpServer()).get(`/grants/${grantId}`).expect(200);

    expect(res.body.id).toBe(grantId);
    expect(res.body.permissions).toEqual(['PREVIEW', 'DOWNLOAD']);
  });

  it('should list grants filtered by actor_id', async () => {
    const res = await request(app.getHttpServer()).get(`/grants?actor_id=${ACTOR_ID}`).expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].actor_id).toBe(ACTOR_ID);
  });

  it('should allow a non-admin actor with a matching active grant', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/permissions/check')
      .send({
        actor_id: ACTOR_ID,
        actor_role: 'EMPLOYEE',
        resource_type: 'DOCUMENT',
        resource_id: RESOURCE_ID,
        action: 'PREVIEW',
        correlation_id: randomUUID(),
      })
      .expect(200);

    expect(res.body.allowed).toBe(true);
    expect(res.body.reason_code).toBeNull();
  });

  it('should hard-deny an ADMIN for content-adjacent actions', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/permissions/check')
      .send({
        actor_id: ACTOR_ID,
        actor_role: 'ADMIN',
        resource_type: 'DOCUMENT',
        resource_id: RESOURCE_ID,
        action: 'PREVIEW',
        correlation_id: randomUUID(),
      })
      .expect(200);

    expect(res.body.allowed).toBe(false);
    expect(res.body.reason_code).toBe('ADMIN_CONTENT_DENIED');
  });

  it('should allow EMPLOYEE task actions without using the ADMIN deny list', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/permissions/check')
      .send({
        actor_id: ACTOR_ID,
        actor_role: 'EMPLOYEE',
        resource_type: 'TASK',
        resource_id: RESOURCE_ID,
        action: 'TASK_VIEW',
        correlation_id: randomUUID(),
      })
      .expect(200);

    expect(res.body.allowed).toBe(true);
    expect(res.body.reason_code).toBeNull();
  });

  it('should hard-deny an ADMIN for task actions', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/permissions/check')
      .send({
        actor_id: ACTOR_ID,
        actor_role: 'ADMIN',
        resource_type: 'TASK',
        resource_id: RESOURCE_ID,
        action: 'TASK_CREATE',
        correlation_id: randomUUID(),
      })
      .expect(200);

    expect(res.body.allowed).toBe(false);
    expect(res.body.reason_code).toBe('ADMIN_CONTENT_DENIED');
  });

  it('should delegate a grant to another actor', async () => {
    const delegateeId = randomUUID();

    const res = await request(app.getHttpServer())
      .post(`/grants/${grantId}/delegate`)
      .send({
        actor_id: delegateeId,
        permissions: ['PREVIEW'],
      })
      .expect(200);

    expect(res.body.parent_grant_id).toBe(grantId);
    expect(res.body.actor_id).toBe(delegateeId);
    expect(res.body.permissions).toEqual(['PREVIEW']);

    // Clean up delegated grant
    await prisma.grant.delete({ where: { id: res.body.id } });
  });

  it('should revoke a grant', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/grants/${grantId}`)
      .send({ reason: 'Integration test cleanup' })
      .expect(200);

    expect(res.body.status).toBe('REVOKED');
    expect(res.body.revoked_at).not.toBeNull();

    // Verify in PostgreSQL
    const dbGrant = await prisma.grant.findUnique({ where: { id: grantId } });
    expect(dbGrant!.status).toBe('REVOKED');
  });

  it('denies request-time access after effective expiry', async () => {
    const actorId = randomUUID();
    const resourceId = randomUUID();
    const taskId = randomUUID();
    const expiresAt = new Date('2026-07-27T23:00:00.000Z').toISOString();

    await request(app.getHttpServer())
      .post('/grants')
      .send({
        grantor_id: GRANTOR_ID,
        actor_id: actorId,
        resource_type: 'DOCUMENT',
        resource_id: resourceId,
        permissions: ['DOWNLOAD'],
        task_id: taskId,
        expires_at: expiresAt,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/internal/permissions/check')
      .send({
        actor_id: actorId,
        actor_role: 'EMPLOYEE',
        resource_type: 'DOCUMENT',
        resource_id: resourceId,
        action: 'DOWNLOAD',
        correlation_id: randomUUID(),
      })
      .expect(200);

    expect(res.body.allowed).toBe(false);
    expect(res.body.reason_code).toBe('GRANT_EXPIRED');
  });

  it('cascades parent revocation to delegated child grants', async () => {
    const parentActorId = randomUUID();
    const childActorId = randomUUID();
    const resourceId = randomUUID();
    const taskId = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const parentGrant = await request(app.getHttpServer())
      .post('/grants')
      .send({
        grantor_id: GRANTOR_ID,
        actor_id: parentActorId,
        resource_type: 'DOCUMENT',
        resource_id: resourceId,
        permissions: ['PREVIEW', 'DOWNLOAD'],
        task_id: taskId,
        expires_at: expiresAt,
      })
      .expect(201);

    const childGrant = await request(app.getHttpServer())
      .post(`/grants/${parentGrant.body.id}/delegate`)
      .send({
        actor_id: childActorId,
        permissions: ['PREVIEW'],
      })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/grants/${parentGrant.body.id}`)
      .send({ reason: 'Parent revoked' })
      .expect(200);

    const delegatedGrant = await prisma.grant.findUniqueOrThrow({
      where: { id: childGrant.body.id },
    });
    expect(delegatedGrant.status).toBe('REVOKED');
    expect(delegatedGrant.revoked_at).not.toBeNull();

    const res = await request(app.getHttpServer())
      .post('/internal/permissions/check')
      .send({
        actor_id: childActorId,
        actor_role: 'EMPLOYEE',
        resource_type: 'DOCUMENT',
        resource_id: resourceId,
        action: 'PREVIEW',
        correlation_id: randomUUID(),
      })
      .expect(200);

    expect(res.body.allowed).toBe(false);
  });

  it('expires due grants idempotently', async () => {
    const actorId = randomUUID();
    const resourceId = randomUUID();
    const taskId = randomUUID();
    const workerNow = new Date('2026-07-28T00:00:00.000Z');
    const beforeCount = await prisma.grant.count({
      where: {
        status: 'ACTIVE',
        revoked_at: null,
        effective_expires_at: { lte: workerNow },
      },
    });
    const expiredGrant = await request(app.getHttpServer())
      .post('/grants')
      .send({
        grantor_id: GRANTOR_ID,
        actor_id: actorId,
        resource_type: 'DOCUMENT',
        resource_id: resourceId,
        permissions: ['PREVIEW'],
        task_id: taskId,
        expires_at: '2026-07-27T00:00:00.000Z',
      })
      .expect(201);

    const firstRun = await permissionService.expireDueGrants(workerNow);
    const secondRun = await permissionService.expireDueGrants(workerNow);

    expect(firstRun).toBe(beforeCount + 1);
    expect(secondRun).toBe(0);

    const persisted = await prisma.grant.findUniqueOrThrow({ where: { id: expiredGrant.body.id } });
    expect(persisted.status).toBe('EXPIRED');
  });

  it('shrinks effective expiry on earlier task deadlines without widening it later', async () => {
    const actorId = randomUUID();
    const resourceId = randomUUID();
    const taskId = randomUUID();
    const created = await request(app.getHttpServer())
      .post('/grants')
      .send({
        grantor_id: GRANTOR_ID,
        actor_id: actorId,
        resource_type: 'DOCUMENT',
        resource_id: resourceId,
        permissions: ['DOWNLOAD'],
        task_id: taskId,
        expires_at: '2026-07-31T00:00:00.000Z',
      })
      .expect(201);

    const initialGrant = await prisma.grant.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(initialGrant.effective_expires_at.toISOString()).toBe('2026-07-31T00:00:00.000Z');

    const shortened = await permissionService.handleTaskDeadlineChanged(
      taskId,
      new Date('2026-07-29T00:00:00.000Z'),
    );
    expect(shortened).toBe(1);

    const afterShorten = await prisma.grant.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(afterShorten.effective_expires_at.toISOString()).toBe('2026-07-29T00:00:00.000Z');

    const extended = await permissionService.handleTaskDeadlineChanged(
      taskId,
      new Date('2026-08-02T00:00:00.000Z'),
    );
    expect(extended).toBe(0);

    const afterExtend = await prisma.grant.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(afterExtend.effective_expires_at.toISOString()).toBe('2026-07-29T00:00:00.000Z');
  });
});
