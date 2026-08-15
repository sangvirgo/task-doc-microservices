import { SecurityPipelineService } from '../src/security/security-pipeline.service';

describe('SecurityPipelineService pagination', () => {
  it('paginates encryption records', async () => {
    const record = {
      id: '60000000-0000-4000-8000-000000000001',
      document_id: '60000000-0000-4000-8000-000000000002',
      version: 1,
      object_key: 'documents/object',
      checksum: 'checksum',
      signature: null,
      kek_version: 1,
      scan_status: 'CLEAN',
      scan_result: null,
      file_size: 10,
      mime_type: 'application/pdf',
      encrypted_dek: 'encrypted-dek',
      created_at: new Date('2026-08-01T00:00:00.000Z'),
    };
    const prisma = {
      encryptionRecord: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([record]),
      },
    };
    const service = new SecurityPipelineService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.listRecords(record.document_id, { page: 2, page_size: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.pagination.total_pages).toBe(3);
    expect(prisma.encryptionRecord.findMany).toHaveBeenCalledWith({
      where: { document_id: record.document_id },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: 1,
      take: 1,
    });
  });
});
