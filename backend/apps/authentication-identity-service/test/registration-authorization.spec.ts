import { ForbiddenException } from '@nestjs/common';

import { AuthController } from '../src/auth/auth.controller';

describe('public registration authorization', () => {
  it('rejects public ADMIN registration', async () => {
    const service = { register: jest.fn() };
    const controller = new AuthController(service as never);

    await expect(
      controller.register({
        email: 'attacker@example.com',
        password: 'Password123!',
        role: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.register).not.toHaveBeenCalled();
  });

  it('keeps public registration limited to EMPLOYEE accounts', async () => {
    const service = {
      register: jest.fn().mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        email: 'employee@example.com',
        role: 'EMPLOYEE',
      }),
    };
    const controller = new AuthController(service as never);

    await controller.register({
      email: 'employee@example.com',
      password: 'Password123!',
      role: 'EMPLOYEE',
    });

    expect(service.register).toHaveBeenCalledWith(
      'employee@example.com',
      'Password123!',
      'EMPLOYEE',
    );
  });
});
