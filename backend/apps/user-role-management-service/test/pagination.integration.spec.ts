import { UsersService } from '../src/users/users.service';

describe('UsersService pagination', () => {
  it('paginates users and the active employee directory', async () => {
    const user = {
      id: '40000000-0000-4000-8000-000000000001',
      email: 'employee@c17.local',
      role: 'EMPLOYEE',
      locked_at: null,
      created_at: new Date('2026-08-01T00:00:00.000Z'),
      Capability: [{ capability: 'ARCHIVE_SUBMIT' }],
    };
    const prisma = {
      user: {
        count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(2),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([user])
          .mockResolvedValueOnce([{ id: user.id, email: user.email }]),
      },
    };
    const service = new UsersService(prisma as never);

    const users = await service.listUsers({ page: 2, page_size: 1 });
    const directory = await service.memberDirectory({ page: 1, page_size: 1 });

    expect(users.pagination.total).toBe(3);
    expect(users.items[0].id).toBe(user.id);
    expect(directory.pagination.total).toBe(2);
    expect(directory.items).toEqual([{ id: user.id, email: user.email }]);
    expect(prisma.user.findMany).toHaveBeenNthCalledWith(1, {
      include: { Capability: true },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: 1,
      take: 1,
    });
    expect(prisma.user.findMany).toHaveBeenNthCalledWith(2, {
      where: { role: 'EMPLOYEE', locked_at: null },
      select: { id: true, email: true },
      orderBy: [{ email: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 1,
    });
  });
});
