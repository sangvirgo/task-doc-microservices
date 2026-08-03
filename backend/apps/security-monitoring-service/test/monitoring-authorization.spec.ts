import { ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '@c17/auth-context';

import { MonitoringController } from '../src/monitoring/monitoring.controller';

describe('monitoring authorization attribution', () => {
  const admin: AuthContext = {
    userId: '10000000-0000-4000-8000-000000000001',
    role: 'ADMIN',
    capabilities: [],
    sessionId: '',
  };

  it('records the authenticated ADMIN as the resolver, not the body-supplied user', async () => {
    const service = {
      resolveAlert: jest.fn().mockResolvedValue({ id: 'alert-1', resolved_by: admin.userId }),
    };
    const controller = new MonitoringController(service as never);

    await (controller.resolveAlert as unknown as (...args: unknown[]) => Promise<unknown>)(
      'alert-1',
      { resolved_by: '20000000-0000-4000-8000-000000000002' },
      admin,
    );

    expect(service.resolveAlert).toHaveBeenCalledWith('alert-1', admin.userId);
  });

  it('rejects non-ADMIN callers for alert reads', async () => {
    const service = { getAlert: jest.fn() };
    const controller = new MonitoringController(service as never);
    const employee: AuthContext = { ...admin, role: 'EMPLOYEE' };

    await expect(controller.getAlert('alert-1', employee)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.getAlert).not.toHaveBeenCalled();
  });
});
