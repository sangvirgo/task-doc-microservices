/**
 * A valid environment for every service under test.
 *
 * Application root modules validate the environment when their module file is evaluated, which
 * happens on import — before any `beforeAll` could set a variable. Setting it here, in a Jest
 * `setupFiles` entry, is what makes importing an `AppModule` in a test possible at all.
 *
 * These values are non-secrets pointing at nothing. No real credential belongs in this file.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'fatal';
process.env.PORT = process.env.PORT ?? '3000';
process.env.RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';

// Database URLs for integration tests (local Docker infrastructure on port 5433)
const PG_BASE = 'postgresql://c17:replace-me-local-only@localhost:5433';
process.env.AUTH_DATABASE_URL = process.env.AUTH_DATABASE_URL ?? `${PG_BASE}/auth_db`;
process.env.USER_ROLE_DATABASE_URL = process.env.USER_ROLE_DATABASE_URL ?? `${PG_BASE}/user_role_db`;
process.env.TASK_DATABASE_URL = process.env.TASK_DATABASE_URL ?? `${PG_BASE}/task_db`;
process.env.DOCUMENT_DATABASE_URL = process.env.DOCUMENT_DATABASE_URL ?? `${PG_BASE}/document_db`;
process.env.DOCUMENT_SECURITY_DATABASE_URL = process.env.DOCUMENT_SECURITY_DATABASE_URL ?? `${PG_BASE}/document_security_db`;
process.env.PERMISSION_DATABASE_URL = process.env.PERMISSION_DATABASE_URL ?? `${PG_BASE}/permission_db`;
process.env.AUDIT_DATABASE_URL = process.env.AUDIT_DATABASE_URL ?? `${PG_BASE}/audit_db`;
process.env.NOTIFICATION_DATABASE_URL = process.env.NOTIFICATION_DATABASE_URL ?? `${PG_BASE}/notification_db`;
process.env.SECURITY_MONITORING_DATABASE_URL = process.env.SECURITY_MONITORING_DATABASE_URL ?? `${PG_BASE}/security_monitoring_db`;

// Redis
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// JWT
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-32-chars-min-for-testing';
process.env.JWT_TTL_SECONDS = process.env.JWT_TTL_SECONDS ?? '1800';

// Permission Service
process.env.PERMISSION_SERVICE_URL = process.env.PERMISSION_SERVICE_URL ?? 'http://localhost:3006';
process.env.PERMISSION_CHECK_TIMEOUT_MS = process.env.PERMISSION_CHECK_TIMEOUT_MS ?? '2000';
