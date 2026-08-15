import { ForbiddenException } from '@nestjs/common';

import { PermissionsController } from '../src/permissions/permissions.controller';

describe('PermissionsController grant authorization', () => {
  const employeeRequest = {
    header: (name: string) =>
      ({
        'x-user-id': '10000000-0000-4000-8000-000000000001',
        'x-user-role': 'EMPLOYEE',
      })[name],
  } as never;

  const grant: { id: string; grantor_id: string; actor_id: string } = {
    id: '30000000-0000-4000-8000-000000000003',
    grantor_id: '20000000-0000-4000-8000-000000000002',
    actor_id: '40000000-0000-4000-8000-000000000004',
  };

  it('allows an employee to list only their own grants', async () => {
    const service = { listGrants: jest.fn().mockResolvedValue([]) };
    const controller = new PermissionsController(service as never);

    await controller.listGrants(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      employeeRequest,
    );

    expect(service.listGrants).toHaveBeenCalledWith(
      {
        actor_id: '10000000-0000-4000-8000-000000000001',
        resource_type: undefined,
        resource_id: undefined,
        status: undefined,
        task_id: undefined,
      },
      { page: 1, page_size: 20 },
    );
  });

  it('rejects an employee reading or revoking a foreign grant', async () => {
    const service = {
      getGrant: jest.fn().mockResolvedValue(grant),
      revokeGrant: jest.fn(),
    };
    const controller = new PermissionsController(service as never);

    await expect(controller.getGrant(grant.id, employeeRequest)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.revokeGrant(grant.id, {}, employeeRequest)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.revokeGrant).not.toHaveBeenCalled();
  });
});
