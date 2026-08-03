import { ForbiddenException } from '@nestjs/common';

import {
  DocumentsController,
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

  it('does not let ADMIN read a record even when the record creator matches', async () => {
    const service = {
      getRecord: jest.fn().mockResolvedValue({
        id: '20000000-0000-4000-8000-000000000002',
        creator_id: '10000000-0000-4000-8000-000000000001',
        entries: [],
      }),
    };
    const controller = new RecordsController(service as never, {} as never, {} as never);

    await expect(
      controller.getRecord('20000000-0000-4000-8000-000000000002', user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.getRecord).not.toHaveBeenCalled();
  });

  it('does not let ADMIN read transfer package metadata', async () => {
    const service = { getTransferPackage: jest.fn() };
    const controller = new TransferPackagesController(service as never, {} as never, {} as never);

    await expect(
      controller.getPackage('30000000-0000-4000-8000-000000000003', user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.getTransferPackage).not.toHaveBeenCalled();
  });

  it('does not let ADMIN create document metadata', async () => {
    const service = {
      createDocument: jest.fn().mockResolvedValue({
        id: '40000000-0000-4000-8000-000000000004',
        title: 'forbidden',
        document_type: 'REPORT',
        security_level: 'INTERNAL',
      }),
    };
    const controller = new DocumentsController(
      service as never,
      {} as never,
      { record: jest.fn() } as never,
      {} as never,
    );

    await expect(
      controller.createDocument(
        {
          title: 'forbidden',
          document_type: 'REPORT',
          owner_id: '10000000-0000-4000-8000-000000000001',
          security_level: 'INTERNAL',
        },
        user,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.createDocument).not.toHaveBeenCalled();
  });

  it('does not let ADMIN create a document version', async () => {
    const service = {
      createDocumentVersion: jest.fn().mockResolvedValue({
        id: '50000000-0000-4000-8000-000000000005',
        version: 2,
      }),
    };
    const permissionClient = { check: jest.fn().mockResolvedValue({ allowed: true }) };
    const controller = new DocumentsController(
      service as never,
      permissionClient as never,
      {} as never,
      { processDocument: jest.fn() } as never,
    );

    await expect(
      controller.createVersion(
        '30000000-0000-4000-8000-000000000003',
        {
          object_key: 'attacker/object',
          checksum: 'attacker-checksum',
          encrypted_dek: 'attacker-dek',
          file_size: 1,
          mime_type: 'text/plain',
        },
        user,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissionClient.check).not.toHaveBeenCalled();
    expect(service.createDocumentVersion).not.toHaveBeenCalled();
  });
});
