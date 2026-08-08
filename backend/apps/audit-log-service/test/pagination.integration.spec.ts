import { AuditService } from '../src/audit/audit.service';

describe('AuditService pagination', () => {
  it('returns filtered audit events with page metadata', async () => {
    const event = {
      id: '30000000-0000-4000-8000-000000000001',
      event_type: 'document.accessed',
      occurred_at: new Date('2026-08-01T00:00:00.000Z'),
      actor_id: '30000000-0000-4000-8000-000000000002',
      resource_type: 'DOCUMENT',
      resource_id: '30000000-0000-4000-8000-000000000003',
      payload: { action: 'PREVIEW' },
      previous_hash: '',
      current_hash: 'hash',
      sequence_number: 3,
      created_at: new Date('2026-08-01T00:00:00.000Z'),
    };
    const prisma = {
      auditEvent: {
        count: jest.fn().mockResolvedValue(5),
        findMany: jest.fn().mockResolvedValue([event]),
      },
    };
    const service = new AuditService(prisma as never);

    const result = await service.listEvents(
      { actor_id: event.actor_id },
      { page: 2, page_size: 2 },
    );

    const where = {
      event_type: undefined,
      actor_id: event.actor_id,
      resource_type: undefined,
      resource_id: undefined,
    };
    expect(prisma.auditEvent.count).toHaveBeenCalledWith({ where });
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ sequence_number: 'desc' }, { id: 'desc' }],
      skip: 2,
      take: 2,
    });
    expect(result.items).toHaveLength(1);
    expect(result.pagination).toMatchObject({ total: 5, total_pages: 3, has_next: true });
  });
});
