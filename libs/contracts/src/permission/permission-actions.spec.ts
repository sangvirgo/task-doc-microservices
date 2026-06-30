import { ADMIN_FORBIDDEN_ACTIONS, PermissionAction } from './permission-actions';

describe('ADMIN forbidden actions', () => {
  // V3 §5.2.1 states this list exhaustively. Restating it here means a future edit to the source
  // list has to be a deliberate change to the rule, not a quiet one.
  const forbiddenByPlan = [
    PermissionAction.TASK_PARTICIPATE,
    PermissionAction.COMMENT_LIST,
    PermissionAction.COMMENT_CREATE,
    PermissionAction.PREVIEW,
    PermissionAction.DOWNLOAD,
    PermissionAction.UPDATE,
    PermissionAction.SHARE,
    PermissionAction.TRANSFER,
    PermissionAction.ARCHIVE_SUBMIT,
    PermissionAction.ARCHIVE_RECEIVE,
    PermissionAction.ARCHIVE_DECIDE,
    PermissionAction.DISPOSAL_APPROVE,
    PermissionAction.DISPOSE,
  ];

  it.each(forbiddenByPlan)('forbids %s', (action) => {
    expect(ADMIN_FORBIDDEN_ACTIONS.has(action)).toBe(true);
  });

  it('contains nothing beyond the plan list', () => {
    expect([...ADMIN_FORBIDDEN_ACTIONS].sort()).toEqual([...forbiddenByPlan].sort());
  });

  it('includes DISPOSE, which V3 §5.2.1 calls out separately from disposal approval', () => {
    expect(ADMIN_FORBIDDEN_ACTIONS.has(PermissionAction.DISPOSE)).toBe(true);
    expect(ADMIN_FORBIDDEN_ACTIONS.has(PermissionAction.DISPOSAL_APPROVE)).toBe(true);
  });
});
