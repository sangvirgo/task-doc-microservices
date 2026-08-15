import { ForbiddenException } from '@nestjs/common';

import { MonitoringStatisticsService } from '../src/monitoring/monitoring-statistics.service';

const EMPLOYEE_ID = '10000000-0000-4000-8000-000000000001';
const ADMIN_ID = '30000000-0000-4000-8000-000000000003';

describe('MonitoringStatisticsService', () => {
  const prisma = { securityAlert: { count: jest.fn() } };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('counts caller alerts for ME and open alerts for organization', async () => {
    prisma.securityAlert.count.mockResolvedValueOnce(2).mockResolvedValueOnce(7);
    const service = new MonitoringStatisticsService(prisma as never);

    const me = await service.getOverview({
      scope: 'ME',
      from: new Date('2026-08-01T00:00:00.000Z'),
      toExclusive: new Date('2026-08-11T00:00:00.000Z'),
      caller: {
        userId: EMPLOYEE_ID,
        role: 'EMPLOYEE',
        capabilities: [],
        sessionId: '',
      },
    });
    const organization = await service.getOverview({
      scope: 'ORGANIZATION',
      from: new Date('2026-08-01T00:00:00.000Z'),
      toExclusive: new Date('2026-08-11T00:00:00.000Z'),
      caller: {
        userId: ADMIN_ID,
        role: 'ADMIN',
        capabilities: [],
        sessionId: '',
      },
    });

    expect(me).toEqual({ security_alerts: 2 });
    expect(organization).toEqual({ security_alerts: 7, open_alerts: 7 });
    expect(prisma.securityAlert.count).toHaveBeenCalledTimes(2);
    expect(prisma.securityAlert.count.mock.calls[0][0].where).toMatchObject({
      actor_id: EMPLOYEE_ID,
      created_at: { gte: expect.any(Date), lt: expect.any(Date) },
    });
    expect(prisma.securityAlert.count.mock.calls[1][0].where).toMatchObject({
      status: 'OPEN',
      created_at: { gte: expect.any(Date), lt: expect.any(Date) },
    });
  });

  it('rejects employee organization statistics before reading Prisma', async () => {
    const service = new MonitoringStatisticsService(prisma as never);

    await expect(
      service.getOverview({
        scope: 'ORGANIZATION',
        from: new Date('2026-08-01T00:00:00.000Z'),
        toExclusive: new Date('2026-08-11T00:00:00.000Z'),
        caller: {
          userId: EMPLOYEE_ID,
          role: 'EMPLOYEE',
          capabilities: [],
          sessionId: '',
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.securityAlert.count).not.toHaveBeenCalled();
  });
});
