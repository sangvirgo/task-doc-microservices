import { permissionCheckRequestSchema } from './permission-check.contract';
import { PermissionAction, ResourceType } from './permission-actions';
import { SystemRole } from '../roles';

describe('permission check request contract', () => {
  const valid = {
    actor_id: '11111111-1111-4111-8111-111111111111',
    actor_role: SystemRole.EMPLOYEE,
    resource_type: ResourceType.DOCUMENT,
    resource_id: '22222222-2222-4222-8222-222222222222',
    action: PermissionAction.DOWNLOAD,
    task_id: '33333333-3333-4333-8333-333333333333',
    correlation_id: '44444444-4444-4444-8444-444444444444',
  };

  it('accepts a well-formed check', () => {
    expect(permissionCheckRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts document ownership context for implicit owner access', () => {
    expect(
      permissionCheckRequestSchema.safeParse({
        ...valid,
        owner_id: valid.actor_id,
        creator_id: '55555555-5555-4555-8555-555555555555',
      }).success,
    ).toBe(true);
  });

  // V3 §8.1: the caller must never supply an expiry. Permission Service resolves it from
  // permission_db alone, because a caller-supplied expiry would let the caller widen the access
  // that gates it.
  it.each(['expires_at', 'effective_expires_at', 'deadline', 'task_deadline'])(
    'rejects a request carrying %s',
    (field) => {
      const result = permissionCheckRequestSchema.safeParse({
        ...valid,
        [field]: '2099-01-01T00:00:00.000Z',
      });

      expect(result.success).toBe(false);
    },
  );

  it('rejects an unknown action rather than treating it as permitted', () => {
    expect(permissionCheckRequestSchema.safeParse({ ...valid, action: 'SUDO' }).success).toBe(
      false,
    );
  });

  it('accepts canonical task actions', () => {
    const actions = [
      PermissionAction.TASK_CREATE,
      PermissionAction.TASK_VIEW,
      PermissionAction.TASK_ASSIGN,
      PermissionAction.TASK_COMMENT,
      PermissionAction.TASK_SUBMIT,
      PermissionAction.TASK_REVIEW,
      PermissionAction.TASK_MODIFY,
    ];

    for (const action of actions) {
      expect(
        permissionCheckRequestSchema.safeParse({
          ...valid,
          resource_type: ResourceType.TASK,
          action,
        }).success,
      ).toBe(true);
    }
  });
});
