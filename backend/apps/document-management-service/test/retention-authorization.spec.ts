import { ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '@c17/auth-context';

import { RetentionDisposalController } from '../src/documents/documents.controller';

describe('retention and disposal authorization', () => {
  type RetentionDocumentsServiceMock = {
    listRetentionHolds: jest.Mock;
    releaseRetentionHold: jest.Mock;
  };

  const admin: AuthContext = {
    userId: '10000000-0000-4000-8000-000000000001',
    role: 'ADMIN',
    capabilities: [],
    sessionId: '',
  };
  const employee: AuthContext = {
    userId: '20000000-0000-4000-8000-000000000002',
    role: 'EMPLOYEE',
    capabilities: [],
    sessionId: '',
  };
  function createController() {
    return new RetentionDisposalController(
      {
        placeRetentionHold: jest.fn(),
        releaseRetentionHold: jest.fn(),
        listRetentionHolds: jest.fn().mockResolvedValue({
          items: [],
          pagination: {
            page: 1,
            page_size: 20,
            total: 0,
            total_pages: 0,
            has_next: false,
            has_previous: false,
          },
        }),
        listDisposalApprovals: jest.fn().mockResolvedValue({
          items: [],
          pagination: {
            page: 1,
            page_size: 20,
            total: 0,
            total_pages: 0,
            has_next: false,
            has_previous: false,
          },
        }),
      } as never,
      { check: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
  }

  function documentsServiceOf(
    controller: RetentionDisposalController,
  ): RetentionDocumentsServiceMock {
    return (controller as unknown as { documentsService: RetentionDocumentsServiceMock })
      .documentsService;
  }

  it('rejects ADMIN but scopes employee retention reads to the caller', async () => {
    const controller = createController();
    const listHolds = controller.listHolds.bind(controller) as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;

    await expect(listHolds(undefined, undefined, admin)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(listHolds(undefined, undefined, employee)).resolves.toEqual(
      expect.objectContaining({ items: [] }),
    );
    expect(documentsServiceOf(controller).listRetentionHolds).toHaveBeenCalledWith(
      {
        document_id: undefined,
        released: undefined,
        placed_by: employee.userId,
      },
      {
        page: 1,
        page_size: 20,
      },
    );
  });

  it('does not let ADMIN release a hold and binds employee release to the caller', async () => {
    const controller = createController();
    const releaseHold = controller.releaseHold.bind(controller) as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;

    await expect(releaseHold('40000000-0000-4000-8000-000000000004', admin)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await releaseHold('40000000-0000-4000-8000-000000000004', employee);
    expect(documentsServiceOf(controller).releaseRetentionHold).toHaveBeenCalledWith(
      '40000000-0000-4000-8000-000000000004',
      employee.userId,
    );
  });

  it('preserves hold placement for an authenticated EMPLOYEE', async () => {
    const placeRetentionHold = jest.fn().mockResolvedValue({ id: 'hold-1' });
    const controller = new RetentionDisposalController(
      {
        placeRetentionHold,
      } as never,
      { check: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    const placeHold = controller.placeHold.bind(controller) as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
    const documentId = '30000000-0000-4000-8000-000000000003';

    await expect(
      placeHold({ document_id: documentId, reason: 'legal review' }, employee),
    ).resolves.toEqual({ id: 'hold-1' });
    expect(placeRetentionHold).toHaveBeenCalledWith({
      document_id: documentId,
      reason: 'legal review',
      placed_by: employee.userId,
    });
  });

  it('rejects ADMIN from running the eligibility worker endpoint', async () => {
    const controller = createController();
    const checkEligibility = controller.checkEligibility.bind(controller) as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;

    await expect(checkEligibility(admin)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
