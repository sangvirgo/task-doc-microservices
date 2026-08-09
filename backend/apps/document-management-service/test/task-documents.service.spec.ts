import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { PermissionAction, ResourceType } from '@c17/contracts';

import { TaskDocumentsService } from '../src/tasks/task-documents.service';

const TASK_ID = '10000000-0000-4000-a000-000000000001';
const DOCUMENT_ID = '20000000-0000-4000-a000-000000000002';
const OTHER_TASK_ID = '60000000-0000-4000-a000-000000000006';
const CREATOR_ID = '30000000-0000-4000-a000-000000000003';
const ASSIGNEE_ID = '40000000-0000-4000-a000-000000000004';
const UNRELATED_ID = '50000000-0000-4000-a000-000000000005';
const EXPIRY = '2026-08-10T17:00:00.000Z';

function context() {
  return {
    task: {
      id: TASK_ID,
      creator_id: CREATOR_ID,
      assignee_id: ASSIGNEE_ID,
      deadline: '2026-08-11T17:00:00.000Z',
    },
    participants: [
      { user_id: CREATOR_ID, role: 'CREATOR' },
      { user_id: ASSIGNEE_ID, role: 'ASSIGNEE' },
    ],
  };
}

function caller(userId = CREATOR_ID) {
  return { userId, role: 'EMPLOYEE', capabilities: [], sessionId: 'session-1' } as never;
}

function document() {
  return {
    id: DOCUMENT_ID,
    title: 'Task document',
    document_type: 'REPORT',
    owner_id: CREATOR_ID,
    creator_id: CREATOR_ID,
    security_level: 'INTERNAL',
    current_version: 1,
  };
}

function associationPage(items: unknown[]) {
  return {
    items,
    pagination: {
      page: 1,
      page_size: 100,
      total: items.length,
      total_pages: items.length > 0 ? 1 : 0,
      has_next: false,
      has_previous: false,
    },
  };
}

function makeService() {
  const documentsService = {
    getDocument: jest.fn().mockResolvedValue(document()),
    attachDocumentToTask: jest.fn().mockResolvedValue({
      id: 'association-1',
      task_id: TASK_ID,
      document_id: DOCUMENT_ID,
      attached_by: CREATOR_ID,
      attached_at: '2026-08-05T12:00:00.000Z',
    }),
    listTaskDocuments: jest.fn(),
    getTaskDocument: jest.fn(),
    detachDocumentFromTask: jest.fn().mockResolvedValue(undefined),
  };
  const taskContextClient = { getContext: jest.fn().mockResolvedValue(context()) };
  const permissionClient = {
    check: jest.fn().mockResolvedValue({ allowed: false, effective_expires_at: null }),
    createTaskScopedGrant: jest.fn().mockResolvedValue({
      id: 'grant-1',
      actor_id: ASSIGNEE_ID,
      permissions: [PermissionAction.PREVIEW],
      effective_expires_at: EXPIRY,
    }),
    revokeTaskDocumentGrants: jest.fn().mockResolvedValue(1),
    listTaskDocumentGrants: jest.fn().mockResolvedValue({
      items: [{ id: 'grant-1', actor_id: ASSIGNEE_ID }],
      pagination: {
        page: 1,
        page_size: 20,
        total: 1,
        total_pages: 1,
        has_next: false,
        has_previous: false,
      },
    }),
    updateTaskDocumentGrant: jest.fn().mockResolvedValue({
      id: 'grant-1',
      actor_id: ASSIGNEE_ID,
      permissions: [PermissionAction.PREVIEW, PermissionAction.DOWNLOAD],
      effective_expires_at: EXPIRY,
    }),
    revokeTaskDocumentGrant: jest.fn().mockResolvedValue({ id: 'grant-1', status: 'REVOKED' }),
  };
  const auditClient = { record: jest.fn().mockResolvedValue(undefined) };

  return {
    service: new TaskDocumentsService(
      documentsService as never,
      taskContextClient as never,
      permissionClient as never,
      auditClient as never,
    ),
    documentsService,
    permissionClient,
    auditClient,
  };
}

describe('TaskDocumentsService', () => {
  it('creates the association before task-scoped grants for direct participants', async () => {
    const { service, documentsService, permissionClient } = makeService();

    const result = await service.attach(
      TASK_ID,
      DOCUMENT_ID,
      [
        {
          actor_id: ASSIGNEE_ID,
          permissions: [PermissionAction.PREVIEW, PermissionAction.DOWNLOAD],
          expires_at: EXPIRY,
        },
      ],
      caller(),
    );

    expect(result.association.document_id).toBe(DOCUMENT_ID);
    expect(documentsService.attachDocumentToTask).toHaveBeenCalledWith({
      task_id: TASK_ID,
      document_id: DOCUMENT_ID,
      attached_by: CREATOR_ID,
    });
    expect(permissionClient.createTaskScopedGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        task_id: TASK_ID,
        resource_id: DOCUMENT_ID,
        actor_id: ASSIGNEE_ID,
        permissions: [PermissionAction.PREVIEW, PermissionAction.DOWNLOAD],
      }),
    );
    expect(documentsService.attachDocumentToTask.mock.invocationCallOrder[0]).toBeLessThan(
      permissionClient.createTaskScopedGrant.mock.invocationCallOrder[0],
    );
  });

  it('compensates the association and earlier grants when a later grant fails', async () => {
    const { service, documentsService, permissionClient } = makeService();
    permissionClient.createTaskScopedGrant
      .mockResolvedValueOnce({
        id: 'grant-1',
        actor_id: ASSIGNEE_ID,
        permissions: [PermissionAction.PREVIEW],
        effective_expires_at: EXPIRY,
      })
      .mockRejectedValueOnce(new Error('permission service unavailable'));

    await expect(
      service.attach(
        TASK_ID,
        DOCUMENT_ID,
        [
          { actor_id: ASSIGNEE_ID, permissions: [PermissionAction.PREVIEW], expires_at: EXPIRY },
          { actor_id: CREATOR_ID, permissions: [PermissionAction.PREVIEW], expires_at: EXPIRY },
        ],
        caller(),
      ),
    ).rejects.toThrow('permission service unavailable');

    expect(permissionClient.revokeTaskDocumentGrants).toHaveBeenCalledWith({
      task_id: TASK_ID,
      resource_id: DOCUMENT_ID,
      reason: 'Attach-and-share compensation after grant creation failure',
    });
    expect(documentsService.detachDocumentFromTask).toHaveBeenCalledWith(TASK_ID, DOCUMENT_ID);
  });

  it('rejects an unrelated recipient before creating an association', async () => {
    const { service, documentsService } = makeService();

    await expect(
      service.attach(
        TASK_ID,
        DOCUMENT_ID,
        [{ actor_id: UNRELATED_ID, permissions: [PermissionAction.PREVIEW], expires_at: EXPIRY }],
        caller(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(documentsService.attachDocumentToTask).not.toHaveBeenCalled();
  });

  it('lists only attached Documents with PREVIEW in the same Task context', async () => {
    const { service, documentsService, permissionClient } = makeService();
    documentsService.listTaskDocuments.mockResolvedValue(
      associationPage([
        {
          association: {
            id: 'association-1',
            task_id: TASK_ID,
            document_id: DOCUMENT_ID,
            attached_by: CREATOR_ID,
            attached_at: '2026-08-05T12:00:00.000Z',
          },
          document: document(),
        },
      ]),
    );
    permissionClient.check.mockImplementation(({ action }: { action: string }) => ({
      allowed: action === PermissionAction.PREVIEW,
      effective_expires_at: action === PermissionAction.PREVIEW ? EXPIRY : null,
    }));

    const result = await service.list(TASK_ID, caller(ASSIGNEE_ID));

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      task_id: TASK_ID,
      document_id: DOCUMENT_ID,
      permissions: [PermissionAction.PREVIEW],
    });
    expect(permissionClient.check).toHaveBeenCalledWith(
      expect.objectContaining({
        task_id: TASK_ID,
        resource_type: ResourceType.DOCUMENT,
        resource_id: DOCUMENT_ID,
        action: PermissionAction.PREVIEW,
      }),
    );
  });

  it('passes pagination to the task-document association query', async () => {
    const { service, documentsService } = makeService();
    documentsService.listTaskDocuments.mockResolvedValue(associationPage([]));

    await service.list(TASK_ID, caller(ASSIGNEE_ID), { page: 2, page_size: 2 });

    expect(documentsService.listTaskDocuments).toHaveBeenCalledWith(TASK_ID, {
      page: 1,
      page_size: 100,
    });
  });

  it('does not list an attached Document when the caller has no task-scoped PREVIEW grant', async () => {
    const { service, documentsService } = makeService();
    documentsService.listTaskDocuments.mockResolvedValue(
      associationPage([
        {
          association: {
            id: 'association-1',
            task_id: TASK_ID,
            document_id: DOCUMENT_ID,
            attached_by: CREATOR_ID,
            attached_at: '2026-08-05T12:00:00.000Z',
          },
          document: document(),
        },
      ]),
    );

    await expect(service.list(TASK_ID, caller(ASSIGNEE_ID))).resolves.toEqual(
      expect.objectContaining({ items: [] }),
    );
  });

  it('gives the document owner all document actions in the task listing', async () => {
    const { service, documentsService, permissionClient } = makeService();
    documentsService.listTaskDocuments.mockResolvedValue(
      associationPage([
        {
          association: {
            id: 'association-1',
            task_id: TASK_ID,
            document_id: DOCUMENT_ID,
            attached_by: CREATOR_ID,
            attached_at: '2026-08-05T12:00:00.000Z',
          },
          document: document(),
        },
      ]),
    );
    permissionClient.check.mockImplementation(({ owner_id }: { owner_id?: string }) => ({
      allowed: owner_id === CREATOR_ID,
      effective_expires_at: owner_id === CREATOR_ID ? null : null,
    }));

    const result = await service.list(TASK_ID, caller(CREATOR_ID));

    expect(result.items[0]?.permissions).toEqual([
      PermissionAction.PREVIEW,
      PermissionAction.DOWNLOAD,
      PermissionAction.UPDATE,
      PermissionAction.SHARE,
      PermissionAction.TRANSFER,
      PermissionAction.DISPOSE,
    ]);
  });

  it('does not let a grant from another Task authorize this Task listing', async () => {
    const { service, documentsService, permissionClient } = makeService();
    documentsService.listTaskDocuments.mockResolvedValue(
      associationPage([
        {
          association: {
            id: 'association-1',
            task_id: TASK_ID,
            document_id: DOCUMENT_ID,
            attached_by: CREATOR_ID,
            attached_at: '2026-08-05T12:00:00.000Z',
          },
          document: document(),
        },
      ]),
    );
    permissionClient.check.mockImplementation(({ task_id, action }) => ({
      allowed: task_id === OTHER_TASK_ID && action === PermissionAction.PREVIEW,
      effective_expires_at: task_id === OTHER_TASK_ID ? EXPIRY : null,
    }));

    await expect(service.list(TASK_ID, caller(ASSIGNEE_ID))).resolves.toEqual(
      expect.objectContaining({ items: [] }),
    );
    expect(permissionClient.check).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: TASK_ID, action: PermissionAction.PREVIEW }),
    );
  });

  it('requires an existing Task–Document association before adding a grant', async () => {
    const { service, documentsService, permissionClient } = makeService();
    documentsService.getTaskDocument.mockResolvedValue(null);

    await expect(
      service.addGrant(
        TASK_ID,
        DOCUMENT_ID,
        { actor_id: ASSIGNEE_ID, permissions: [PermissionAction.PREVIEW], expires_at: EXPIRY },
        caller(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(permissionClient.createTaskScopedGrant).not.toHaveBeenCalled();
  });

  it('lists grants only for an existing task-document association', async () => {
    const { service, documentsService, permissionClient } = makeService();
    documentsService.getTaskDocument.mockResolvedValue({
      association: { id: 'association-1', task_id: TASK_ID, document_id: DOCUMENT_ID },
      document: document(),
    });

    const result = await service.listGrants(TASK_ID, DOCUMENT_ID, caller());

    expect(result.items).toHaveLength(1);
    expect(permissionClient.listTaskDocumentGrants).toHaveBeenCalledWith({
      task_id: TASK_ID,
      resource_id: DOCUMENT_ID,
      page: 1,
      page_size: 20,
      caller: expect.objectContaining({ userId: CREATOR_ID }),
    });
  });

  it('updates and revokes one task-document grant without detaching the document', async () => {
    const { service, documentsService, permissionClient } = makeService();
    documentsService.getTaskDocument.mockResolvedValue({
      association: { id: 'association-1', task_id: TASK_ID, document_id: DOCUMENT_ID },
      document: document(),
    });

    await service.updateGrant(
      TASK_ID,
      DOCUMENT_ID,
      'grant-1',
      { permissions: [PermissionAction.PREVIEW, PermissionAction.DOWNLOAD], expires_at: EXPIRY },
      caller(),
    );
    await service.revokeGrant(TASK_ID, DOCUMENT_ID, 'grant-1', caller());

    expect(permissionClient.updateTaskDocumentGrant).toHaveBeenCalledWith({
      task_id: TASK_ID,
      resource_id: DOCUMENT_ID,
      grant_id: 'grant-1',
      permissions: [PermissionAction.PREVIEW, PermissionAction.DOWNLOAD],
      expires_at: EXPIRY,
      caller: expect.objectContaining({ userId: CREATOR_ID }),
    });
    expect(permissionClient.revokeTaskDocumentGrant).toHaveBeenCalledWith({
      task_id: TASK_ID,
      resource_id: DOCUMENT_ID,
      grant_id: 'grant-1',
      reason: 'Task-document grant revoked',
      caller: expect.objectContaining({ userId: CREATOR_ID }),
    });
    expect(documentsService.detachDocumentFromTask).not.toHaveBeenCalled();
  });

  it('detaches the association and revokes only grants for that Task–Document pair', async () => {
    const { service, documentsService, permissionClient, auditClient } = makeService();
    documentsService.getTaskDocument.mockResolvedValue({
      association: {
        id: 'association-1',
        task_id: TASK_ID,
        document_id: DOCUMENT_ID,
        attached_by: CREATOR_ID,
        attached_at: '2026-08-05T12:00:00.000Z',
      },
      document: document(),
    });

    await service.detach(TASK_ID, DOCUMENT_ID, caller());

    expect(documentsService.detachDocumentFromTask).toHaveBeenCalledWith(TASK_ID, DOCUMENT_ID);
    expect(permissionClient.revokeTaskDocumentGrants).toHaveBeenCalledWith({
      task_id: TASK_ID,
      resource_id: DOCUMENT_ID,
      reason: 'Task-document association detached',
    });
    expect(auditClient.record).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'DOCUMENT_GRANTS_REVOKED_DUE_TO_TASK_DETACH' }),
    );
  });
});
