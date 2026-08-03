import { ForbiddenException } from '@nestjs/common';

import {
  RecordsController,
  TransferPackagesController,
} from '../src/documents/documents.controller';

describe('document metadata authorization scope', () => {
  const user: never = {
    userId: '10000000-0000-4000-8000-000000000001',
    role: 'ADMIN',
    capabilities: [],
    sessionId: '',
  } as never;

  it('does not let ADMIN select another creator when listing records', async () => {
    const service = { listRecords: jest.fn() };
    const controller = new RecordsController(service as never, {} as never, {} as never);

    await expect(
      controller.listRecords('20000000-0000-4000-8000-000000000002', undefined, user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.listRecords).not.toHaveBeenCalled();
  });

  it('does not let ADMIN read transfer package metadata', async () => {
    const service = { getTransferPackage: jest.fn() };
    const controller = new TransferPackagesController(service as never, {} as never, {} as never);

    await expect(
      controller.getPackage('30000000-0000-4000-8000-000000000003', user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.getTransferPackage).not.toHaveBeenCalled();
  });
});
