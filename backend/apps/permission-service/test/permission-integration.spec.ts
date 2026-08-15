import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { PermissionsController } from '../src/permissions/permissions.controller';
import { PermissionService } from '../src/permissions/permission.service';
import { PermissionPrismaService } from '../src/prisma/permission-prisma.service';
import { TaskContextClient } from '../src/tasks/task-context.client';
import { TaskDocumentClient } from '../src/tasks/task-document.client';

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
  const ADMIN_ID = randomUUID();
  const RESOURCE_ID = randomUUID();
  const TASK_ID = randomUUID();
  let grantId: string;

  function adminHeaders(): Record<string, string> {
    return { 'x-user-id': ADMIN_ID, 'x-user-role': 'ADMIN' };
  }

  function employeeHeaders(userId: string): Record<string, string> {
    return { 'x-user-id': userId, 'x-user-role': 'EMPLOYEE' };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [
        PermissionService,
        PermissionPrismaService,
        {
          provide: TaskContextClient,
          useValue: {
            getContext: jest.fn().mockResolvedValue({
              task: {
                id: TASK_ID,
                creator_id: GRANTOR_ID,
                assignee_id: ACTOR_ID,
                deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              },
              participants: [
                { user_id: GRANTOR_ID, role: 'CREATOR' },
                { user_id: ACTOR_ID, role: 'ASSIGNEE' },
              ],
            }),
          },
        },
        {
          provide: TaskDocumentClient,
          useValue: { exists: jest.fn().mockResolvedValue(true) },
        },
      ],
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
        where: {
          OR: [{ actor_id: ACTOR_ID }, { grantor_id: ADMIN_ID }, { grantor_id: GRANTOR_ID }],
        },
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
      .set(adminHeaders())
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
    const res = await request(app.getHttpServer())
      .get(`/grants/${grantId}`)
      .set(adminHeaders())
      .expect(200);

    expect(res.body.id).toBe(grantId);
    expect(res.body.permissions).toEqual(['PREVIEW', 'DOWNLOAD']);
  });

  it('should update and revoke one task-document grant without detaching the association', async () => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const createRes = await request(app.getHttpServer())
      .post('/internal/grants/task-document')
      .set(employeeHeaders(GRANTOR_ID))
      .send({
        task_id: TASK_ID,
        resource_type: 'DOCUMENT',
        resource_id: RESOURCE_ID,
        actor_id: ACTOR_ID,
        permissions: ['PREVIEW'],
        expires_at: expiresAt,
      })
      .expect(201);

    const taskGrantId = createRes.body.id as string;
    const updated = await request(app.getHttpServer())
      .patch(`/internal/grants/task-document/${taskGrantId}`)
      .set(employeeHeaders(GRANTOR_ID))
      .send({
        task_id: TASK_ID,
        resource_type: 'DOCUMENT',
        resource_id: RESOURCE_ID,
        permissions: ['PREVIEW', 'DOWNLOAD'],
      })
      .expect(200);
    expect(updated.body.permissions).toEqual(['PREVIEW', 'DOWNLOAD']);

    const revoked = await request(app.getHttpServer())
      .delete(`/internal/grants/task-document/${taskGrantId}`)
      .set(employeeHeaders(GRANTOR_ID))
      .send({
        task_id: TASK_ID,
        resource_type: 'DOCUMENT',
        resource_id: RESOURCE_ID,
        reason: 'Task grant no longer needed',
      })
      .expect(200);
    expect(revoked.body.status).toBe('REVOKED');
  });

  it('should list grants filtered by actor_id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/grants?actor_id=${ACTOR_ID}`)
      .set(adminHeaders())
      .expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].actor_id).toBe(ACTOR_ID);
    expect(res.body.pagination).toMatchObject({ page: 1, page_size: 20 });
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

  it('should allow the document owner every document action without a separate grant', async () => {
    const ownerId = randomUUID();
    const res = await request(app.getHttpServer())
      .post('/internal/permissions/check')
      .send({
        actor_id: ownerId,
        actor_role: 'EMPLOYEE',
        resource_type: 'DOCUMENT',
        resource_id: randomUUID(),
        action: 'DISPOSE',
        owner_id: ownerId,
        creator_id: randomUUID(),
        correlation_id: randomUUID(),
      })
      .expect(200);

    expect(res.body).toEqual({
      allowed: true,
      reason_code: null,
      effective_expires_at: null,
    });
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
    const delegateeId = GRANTOR_ID;

    const res = await request(app.getHttpServer())
      .post(`/grants/${grantId}/delegate`)
      .set(adminHeaders())
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
      .set(adminHeaders())
      .send({ reason: 'Integration test cleanup' })
      .expect(200);

    expect(res.body.status).toBe('REVOKED');
    expect(res.body.revoked_at).not.toBeNull();

    // Verify in PostgreSQL
    const dbGrant = await prisma.grant.findUnique({ where: { id: grantId } });
    expect(dbGrant!.status).toBe('REVOKED');
  });

  it('denies request-time access after effective expiry', async () => {
    const actorId = ACTOR_ID;
    const resourceId = randomUUID();
    const taskId = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await request(app.getHttpServer())
      .post('/grants')
      .set(adminHeaders())
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

    await permissionService.expireDueGrants(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));

    const res = await request(app.getHttpServer())
      .post('/internal/permissions/check')
      .send({
        actor_id: actorId,
        actor_role: 'EMPLOYEE',
        resource_type: 'DOCUMENT',
        resource_id: resourceId,
        action: 'DOWNLOAD',
        task_id: taskId,
        correlation_id: randomUUID(),
      })
      .expect(200);

    expect(res.body.allowed).toBe(false);
    expect(res.body.reason_code).toBe('GRANT_EXPIRED');
  });

  it('cascades parent revocation to delegated child grants', async () => {
    const parentActorId = ACTOR_ID;
    const childActorId = GRANTOR_ID;
    const resourceId = randomUUID();
    const taskId = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const parentGrant = await request(app.getHttpServer())
      .post('/grants')
      .set(adminHeaders())
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
      .set(adminHeaders())
      .send({
        actor_id: childActorId,
        permissions: ['PREVIEW'],
      })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/grants/${parentGrant.body.id}`)
      .set(adminHeaders())
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
    const actorId = ACTOR_ID;
    const resourceId = randomUUID();
    const taskId = randomUUID();
    const workerNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const beforeCount = await prisma.grant.count({
      where: {
        status: 'ACTIVE',
        revoked_at: null,
        effective_expires_at: { lte: workerNow },
      },
    });
    const expiredGrant = await request(app.getHttpServer())
      .post('/grants')
      .set(adminHeaders())
      .send({
        grantor_id: GRANTOR_ID,
        actor_id: actorId,
        resource_type: 'DOCUMENT',
        resource_id: resourceId,
        permissions: ['PREVIEW'],
        task_id: taskId,
        expires_at: expiresAt,
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
    const actorId = ACTOR_ID;
    const resourceId = randomUUID();
    const taskId = randomUUID();
    const initialExpiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const shortenedDeadline = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const extendedDeadline = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const created = await request(app.getHttpServer())
      .post('/grants')
      .set(adminHeaders())
      .send({
        grantor_id: GRANTOR_ID,
        actor_id: actorId,
        resource_type: 'DOCUMENT',
        resource_id: resourceId,
        permissions: ['DOWNLOAD'],
        task_id: taskId,
        expires_at: initialExpiresAt.toISOString(),
      })
      .expect(201);

    const initialGrant = await prisma.grant.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(initialGrant.effective_expires_at.toISOString()).toBe(initialExpiresAt.toISOString());

    const shortened = await permissionService.handleTaskDeadlineChanged(taskId, shortenedDeadline);
    expect(shortened).toBe(1);

    const afterShorten = await prisma.grant.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(afterShorten.effective_expires_at.toISOString()).toBe(shortenedDeadline.toISOString());

    const extended = await permissionService.handleTaskDeadlineChanged(taskId, extendedDeadline);
    expect(extended).toBe(0);

    const afterExtend = await prisma.grant.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(afterExtend.effective_expires_at.toISOString()).toBe(shortenedDeadline.toISOString());
  });
});
