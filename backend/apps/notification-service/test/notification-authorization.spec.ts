import { ForbiddenException } from '@nestjs/common';

import { NotificationsController } from '../src/notifications/notifications.controller';

describe('NotificationsController authorization', () => {
  const service = {
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
  };
  const controller = new NotificationsController(service as never);

  it('rejects another user reading preferences', async () => {
    await expect(
      controller.getPreferences('20000000-0000-4000-8000-000000000002', {
        header: (name: string) =>
          name === 'x-user-id' ? '20000000-0000-4000-8000-000000000001' : 'EMPLOYEE',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.getPreferences).not.toHaveBeenCalled();
  });
});
