import { ForbiddenException } from '@nestjs/common';

import { DocumentStatisticsService } from '../src/documents/document-statistics.service';

const EMPLOYEE_ID = '10000000-0000-4000-8000-000000000001';
const FOREIGN_ID = '20000000-0000-4000-8000-000000000002';

describe('DocumentStatisticsService', () => {
  const prisma = {
    document: { findMany: jest.fn() },
    taskDocument: { findMany: jest.fn() },
    retentionHold: { findMany: jest.fn() },
  };
  const permissionClient = { check: jest.fn() };
  const taskDocumentsService = { list: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('counts owned and PREVIEW-granted documents and visible task documents', async () => {
    prisma.document.findMany.mockResolvedValueOnce([
      { id: 'doc-owned', owner_id: EMPLOYEE_ID, creator_id: EMPLOYEE_ID },
      { id: 'doc-granted', owner_id: FOREIGN_ID, creator_id: FOREIGN_ID },
      { id: 'doc-denied', owner_id: FOREIGN_ID, creator_id: FOREIGN_ID },
      { id: 'doc-task-granted', owner_id: FOREIGN_ID, creator_id: FOREIGN_ID },
    ]);
    permissionClient.check
      .mockResolvedValueOnce({ allowed: true, reason_code: null })
      .mockResolvedValueOnce({ allowed: true, reason_code: null })
      .mockResolvedValueOnce({ allowed: false, reason_code: 'NO_GRANT' })
      .mockResolvedValueOnce({ allowed: false, reason_code: 'NO_GRANT' });
    prisma.taskDocument.findMany.mockResolvedValueOnce([{ task_id: 'task-visible' }]);
    taskDocumentsService.list.mockResolvedValueOnce({
      items: [
        {
          association_id: 'association-1',
          document_id: 'doc-task-granted',
          attached_at: '2026-08-03T10:00:00.000Z',
        },
      ],
      pagination: { has_next: false },
    });

    const service = new DocumentStatisticsService(
      prisma as never,
      permissionClient as never,
      taskDocumentsService as never,
    );
    const result = await service.getOverview({
      scope: 'ME',
      from: new Date('2026-08-01T00:00:00.000Z'),
      toExclusive: new Date('2026-08-11T00:00:00.000Z'),
      caller: {
        userId: EMPLOYEE_ID,
        role: 'EMPLOYEE',
        capabilities: [],
        sessionId: '',
      },
    });

    expect(result.visible_documents).toBe(3);
    expect(result.task_documents).toBe(1);
    expect(result.eligible_documents).toBeUndefined();
  });

  it('rejects employee organization aggregation before reading Prisma', async () => {
    const service = new DocumentStatisticsService(
      prisma as never,
      permissionClient as never,
      taskDocumentsService as never,
    );

    await expect(
      service.getOverview({
        scope: 'ORGANIZATION',
        from: new Date('2026-08-01T00:00:00.000Z'),
        toExclusive: new Date('2026-08-11T00:00:00.000Z'),
        caller: {
          userId: EMPLOYEE_ID,
          role: 'EMPLOYEE',
          capabilities: [],
          sessionId: '',
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });
});
