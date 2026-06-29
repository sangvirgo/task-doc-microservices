"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Producer = exports.EventType = void 0;
exports.EventType = {
    AUTH_LOGIN_FAILED: 'auth.login.failed',
    AUTH_SESSION_REVOKED: 'auth.session.revoked',
    USER_LOCKED: 'user.locked',
    USER_UNLOCKED: 'user.unlocked',
    USER_CAPABILITY_GRANTED: 'user.capability.granted',
    USER_CAPABILITY_REVOKED: 'user.capability.revoked',
    PERMISSION_DECISION_MADE: 'permission.decision.made',
    PERMISSION_GRANT_EXPIRED: 'permission.grant.expired',
    TASK_DEADLINE_CHANGED: 'task.deadline.changed',
};
exports.Producer = {
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
};
//# sourceMappingURL=event-types.js.map