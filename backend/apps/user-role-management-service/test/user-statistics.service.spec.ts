import { ForbiddenException } from '@nestjs/common';

import { UserStatisticsService } from '../src/users/user-statistics.service';

const ADMIN_ID = '30000000-0000-4000-8000-000000000003';
const EMPLOYEE_ID = '10000000-0000-4000-8000-000000000001';

describe('UserStatisticsService', () => {
  const prisma = { user: { findMany: jest.fn() } };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('counts users and builds cumulative organization growth', async () => {
    prisma.user.findMany.mockResolvedValue([
      { role: 'ADMIN', locked_at: null, created_at: new Date('2026-07-01T00:00:00.000Z') },
      { role: 'EMPLOYEE', locked_at: null, created_at: new Date('2026-08-02T00:00:00.000Z') },
      {
        role: 'EMPLOYEE',
        locked_at: new Date('2026-08-03T00:00:00.000Z'),
        created_at: new Date('2026-08-03T00:00:00.000Z'),
      },
    ]);

    const service = new UserStatisticsService(prisma as never);
    const result = await service.getOverview({
      scope: 'ORGANIZATION',
      from: new Date('2026-08-01T00:00:00.000Z'),
      toExclusive: new Date('2026-08-04T00:00:00.000Z'),
      caller: {
        userId: ADMIN_ID,
        role: 'ADMIN',
        capabilities: [],
        sessionId: '',
      },
    });

    expect(result.users).toEqual({ total: 3, active_employees: 1, locked_users: 1 });
    expect(result.growth_trend).toEqual([
      { date: '2026-08-01', users: 1 },
      { date: '2026-08-02', users: 2 },
      { date: '2026-08-03', users: 3 },
    ]);
  });

  it('rejects employee organization statistics before reading Prisma', async () => {
    const service = new UserStatisticsService(prisma as never);

    await expect(
      service.getOverview({
        scope: 'ORGANIZATION',
        from: new Date('2026-08-01T00:00:00.000Z'),
        toExclusive: new Date('2026-08-04T00:00:00.000Z'),
        caller: {
          userId: EMPLOYEE_ID,
          role: 'EMPLOYEE',
          capabilities: [],
          sessionId: '',
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
