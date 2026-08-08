import { PermissionService } from '../src/permissions/permission.service';

describe('PermissionService pagination', () => {
  it('returns a paginated grant envelope and applies a stable bounded query', async () => {
    const grant = {
      id: '10000000-0000-4000-8000-000000000001',
      grantor_id: '10000000-0000-4000-8000-000000000002',
      actor_id: '10000000-0000-4000-8000-000000000003',
      resource_type: 'DOCUMENT',
      resource_id: '10000000-0000-4000-8000-000000000004',
      permissions: ['PREVIEW'],
      task_id: '10000000-0000-4000-8000-000000000005',
      expires_at: new Date('2026-08-01T00:00:00.000Z'),
      effective_expires_at: new Date('2026-08-01T00:00:00.000Z'),
      status: 'ACTIVE',
      revoked_at: null,
      parent_grant_id: null,
      created_at: new Date('2026-07-01T00:00:00.000Z'),
    };
    const prisma = {
      grant: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([grant]),
      },
    };
    const service = new PermissionService(prisma as never, {} as never, {} as never);

    const result = await service.listGrants(
      { actor_id: grant.actor_id },
      { page: 2, page_size: 1 },
    );

    expect(prisma.grant.count).toHaveBeenCalledWith({ where: { actor_id: grant.actor_id } });
    expect(prisma.grant.findMany).toHaveBeenCalledWith({
      where: { actor_id: grant.actor_id },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: 1,
      take: 1,
    });
    expect(result.pagination).toEqual({
      page: 2,
      page_size: 1,
      total: 3,
      total_pages: 3,
      has_next: true,
      has_previous: true,
    });
    expect(result.items).toHaveLength(1);
  });
});
