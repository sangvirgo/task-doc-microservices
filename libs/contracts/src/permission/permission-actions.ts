/**
 * Resources and actions understood by Permission Service (V3 §8.1).
 */
export const ResourceType = {
  DOCUMENT: 'DOCUMENT',
  TASK: 'TASK',
  TASK_COMMENT: 'TASK_COMMENT',
  TRANSFER_PACKAGE: 'TRANSFER_PACKAGE',
} as const;

export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType];

export const PermissionAction = {
  // Document content
  PREVIEW: 'PREVIEW',
  DOWNLOAD: 'DOWNLOAD',
  UPDATE: 'UPDATE',
  SHARE: 'SHARE',
  TRANSFER: 'TRANSFER',
  DISPOSE: 'DISPOSE',
  // Task operations
  TASK_CREATE: 'TASK_CREATE',
  TASK_VIEW: 'TASK_VIEW',
  TASK_ASSIGN: 'TASK_ASSIGN',
  TASK_COMMENT: 'TASK_COMMENT',
  TASK_SUBMIT: 'TASK_SUBMIT',
  TASK_REVIEW: 'TASK_REVIEW',
  TASK_MODIFY: 'TASK_MODIFY',
  // Archive custody
  ARCHIVE_SUBMIT: 'ARCHIVE_SUBMIT',
  ARCHIVE_RECEIVE: 'ARCHIVE_RECEIVE',
  ARCHIVE_DECIDE: 'ARCHIVE_DECIDE',
  DISPOSAL_APPROVE: 'DISPOSAL_APPROVE',
} as const;

export type PermissionAction = (typeof PermissionAction)[keyof typeof PermissionAction];

export const PERMISSION_ACTIONS: readonly PermissionAction[] = Object.values(PermissionAction);

/**
 * The exhaustive ADMIN forbidden list of V3 §5.2.1, expressed as actions.
 *
 * This list is exhaustive of what is currently known, not of what is possible. Any new right
 * that touches content, task participation, or archive custody must be tested against ADR-0004
 * before it is added.
 */
export const ADMIN_FORBIDDEN_ACTIONS: ReadonlySet<PermissionAction> = new Set<PermissionAction>([
  PermissionAction.TASK_CREATE, // task creation
  PermissionAction.TASK_VIEW, // task detail and activity
  PermissionAction.TASK_ASSIGN, // assignee and participant mutation
  PermissionAction.TASK_COMMENT, // comment read/write
  PermissionAction.TASK_SUBMIT, // task submission
  PermissionAction.TASK_REVIEW, // review decision
  PermissionAction.TASK_MODIFY, // status, block, unblock
  PermissionAction.PREVIEW, // document preview
  PermissionAction.DOWNLOAD, // document download
  PermissionAction.UPDATE, // document update
  PermissionAction.SHARE, // document sharing
  PermissionAction.TRANSFER, // document transfer
  PermissionAction.ARCHIVE_SUBMIT, // archive submission
  PermissionAction.ARCHIVE_RECEIVE, // archive reception
  PermissionAction.ARCHIVE_DECIDE, // archive acceptance or rejection
  PermissionAction.DISPOSAL_APPROVE, // disposal approval
  PermissionAction.DISPOSE, // DISPOSE permission
]);

export function isPermissionAction(value: string): value is PermissionAction {
  return (PERMISSION_ACTIONS as readonly string[]).includes(value);
}

export function isAdminForbiddenAction(action: PermissionAction): boolean {
  return ADMIN_FORBIDDEN_ACTIONS.has(action);
}
