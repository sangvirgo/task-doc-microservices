"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVICE_NAMES = exports.SERVICES = void 0;
exports.SERVICES = [
    { name: 'api-gateway', port: 3000, database: null },
    { name: 'authentication-identity-service', port: 3001, database: 'auth_db' },
    { name: 'user-role-management-service', port: 3002, database: 'user_role_db' },
    { name: 'task-management-service', port: 3003, database: 'task_db' },
    { name: 'document-management-service', port: 3004, database: 'document_db' },
    { name: 'document-security-service', port: 3005, database: 'document_security_db' },
    { name: 'permission-service', port: 3006, database: 'permission_db' },
    { name: 'audit-log-service', port: 3007, database: 'audit_db' },
    { name: 'notification-service', port: 3008, database: 'notification_db' },
    { name: 'security-monitoring-service', port: 3009, database: 'security_monitoring_db' },
];
exports.SERVICE_NAMES = exports.SERVICES.map((s) => s.name);
//# sourceMappingURL=services.js.map