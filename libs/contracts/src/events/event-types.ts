/**
 * Event type names. Kept in one place so producer and consumer cannot drift.
 */
export const EventType = {
  // authentication-identity-service
  AUTH_LOGIN_FAILED: 'auth.login.failed',
  AUTH_SESSION_REVOKED: 'auth.session.revoked',

  // user-role-management-service
  USER_LOCKED: 'user.locked',
  USER_UNLOCKED: 'user.unlocked',
  USER_CAPABILITY_GRANTED: 'user.capability.granted',
  USER_CAPABILITY_REVOKED: 'user.capability.revoked',

  // permission-service
  PERMISSION_DECISION_MADE: 'permission.decision.made',
  PERMISSION_GRANT_EXPIRED: 'permission.grant.expired',

  // task-management-service
  TASK_CREATED: 'task.created',
  TASK_DEADLINE_CHANGED: 'task.deadline.changed',

  // document-management-service
  DOCUMENT_CREATED: 'document.created',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

/** Logical producer names, matching the ten deployable applications. */
export const Producer = {
  API_GATEWAY: 'api-gateway',
  AUTHENTICATION_IDENTITY_SERVICE: 'authentication-identity-service',
  USER_ROLE_MANAGEMENT_SERVICE: 'user-role-management-service',
  TASK_MANAGEMENT_SERVICE: 'task-management-service',
  DOCUMENT_MANAGEMENT_SERVICE: 'document-management-service',
  DOCUMENT_SECURITY_SERVICE: 'document-security-service',
  PERMISSION_SERVICE: 'permission-service',
  AUDIT_LOG_SERVICE: 'audit-log-service',
  NOTIFICATION_SERVICE: 'notification-service',
  SECURITY_MONITORING_SERVICE: 'security-monitoring-service',
} as const;

export type Producer = (typeof Producer)[keyof typeof Producer];
