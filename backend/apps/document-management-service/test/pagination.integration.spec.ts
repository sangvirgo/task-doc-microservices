import { DocumentsService } from '../src/documents/documents.service';

const OWNER_ID = '10000000-0000-4000-8000-000000000001';

function documentRecord() {
  const now = new Date('2026-08-07T00:00:00.000Z');
  return {
    id: '20000000-0000-4000-8000-000000000002',
    title: 'Paginated document',
    document_type: 'MEMO',
    owner_id: OWNER_ID,
    creator_id: OWNER_ID,
    security_level: 'INTERNAL',
    status: 'UPLOADED',
    current_version: 1,
    retention_policy: null,
    archive_status: null,
    record_id: null,
    created_at: now,
    updated_at: now,
  };
}

describe('DocumentsService pagination', () => {
  it('counts and bounds the filtered document query', async () => {
    const prisma = {
      document: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([documentRecord()]),
      },
    };
    const service = new DocumentsService(prisma as never);

    const result = await service.listDocuments(
      { owner_id: OWNER_ID, status: 'UPLOADED' },
      { page: 2, page_size: 2 },
    );

    expect(prisma.document.count).toHaveBeenCalledWith({
      where: { owner_id: OWNER_ID, status: 'UPLOADED' },
    });
    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: { owner_id: OWNER_ID, status: 'UPLOADED' },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: 2,
      take: 2,
    });
    expect(result).toEqual({
      items: [expect.objectContaining({ id: documentRecord().id })],
      pagination: {
        page: 2,
        page_size: 2,
        total: 3,
        total_pages: 2,
        has_next: false,
        has_previous: true,
      },
    });
  });
});
