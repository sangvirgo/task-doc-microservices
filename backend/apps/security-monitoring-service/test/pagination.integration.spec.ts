import { MonitoringService } from '../src/monitoring/monitoring.service';

describe('MonitoringService pagination', () => {
  it('paginates alerts and rules with deterministic ordering', async () => {
    const alert = {
      id: '50000000-0000-4000-8000-000000000001',
      rule_id: '50000000-0000-4000-8000-000000000002',
      severity: 'HIGH',
      actor_id: null,
      description: 'Repeated denied content access threshold reached',
      metadata: null,
      status: 'OPEN',
      resolved_at: null,
      resolved_by: null,
      created_at: new Date('2026-08-01T00:00:00.000Z'),
    };
    const rule = {
      id: '50000000-0000-4000-8000-000000000003',
      name: 'Failed logins',
      description: null,
      rule_type: 'FAILED_LOGIN',
      threshold: 5,
      window_minutes: 15,
      enabled: true,
      action: 'ALERT',
      created_at: new Date('2026-08-01T00:00:00.000Z'),
    };
    const prisma = {
      securityAlert: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([alert]),
      },
      securityRule: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([rule]),
      },
    };
    const service = new MonitoringService(prisma as never, {} as never);

    const alerts = await service.listAlerts({ status: 'OPEN' }, { page: 2, page_size: 1 });
    const rules = await service.listRules({ page: 1, page_size: 1 });

    expect(alerts.pagination.total).toBe(2);
    expect(alerts.items[0].id).toBe(alert.id);
    expect(rules.pagination.total).toBe(1);
    expect(prisma.securityAlert.findMany).toHaveBeenCalledWith({
      where: { status: 'OPEN' },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: 1,
      take: 1,
    });
    expect(prisma.securityRule.findMany).toHaveBeenCalledWith({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 1,
    });
  });
});
