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

  it('denies document metadata and version reads when PREVIEW is not granted', async () => {
    const service = {
      getDocument: jest.fn(),
      getDocumentVersions: jest.fn(),
    };
    const permissionClient = {
      check: jest.fn().mockResolvedValue({
        allowed: false,
        reason_code: 'NO_GRANT',
        effective_expires_at: null,
      }),
    };
    const employee = {
      userId: '10000000-0000-4000-8000-000000000001',
      role: 'EMPLOYEE',
      capabilities: [],
      sessionId: '',
    } as never;
    const controller = new DocumentsController(
      service as never,
      permissionClient as never,
      {} as never,
      {} as never,
    );

    await expect(
      controller.getDocument('40000000-0000-4000-a000-000000000004', employee),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.getVersions('40000000-0000-4000-a000-000000000004', employee),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.getDocument).not.toHaveBeenCalled();
    expect(service.getDocumentVersions).not.toHaveBeenCalled();
  });

  it('allows document metadata and version reads when PREVIEW is granted', async () => {
    const documentId = '40000000-0000-4000-a000-000000000004';
    const service = {
      getDocument: jest.fn().mockResolvedValue({ id: documentId, title: 'shared document' }),
      getDocumentVersions: jest
        .fn()
        .mockResolvedValue([
          { id: '50000000-0000-4000-a000-000000000005', document_id: documentId, version: 1 },
        ]),
    };
    const permissionClient = {
      check: jest.fn().mockResolvedValue({
        allowed: true,
        effective_expires_at: '2026-08-10T17:00:00.000Z',
      }),
    };
    const employee = {
      userId: '10000000-0000-4000-8000-000000000001',
      role: 'EMPLOYEE',
      capabilities: [],
      sessionId: '',
    } as never;
    const controller = new DocumentsController(
      service as never,
      permissionClient as never,
      {} as never,
      {} as never,
    );

    await expect(controller.getDocument(documentId, employee)).resolves.toMatchObject({
      id: documentId,
    });
    await expect(controller.getVersions(documentId, employee)).resolves.toHaveLength(1);
    expect(permissionClient.check).toHaveBeenCalledWith(
      expect.objectContaining({
        resource_id: documentId,
        resource_type: 'DOCUMENT',
        action: 'PREVIEW',
      }),
    );
    expect(service.getDocument).toHaveBeenCalledWith(documentId);
    expect(service.getDocumentVersions).toHaveBeenCalledWith(documentId);
  });
});
