'use strict';

const { execFileSync } = require('node:child_process');

const LOCAL_TEST_HOSTS = new Set(['localhost', '127.0.0.1']);
const E2E_DATABASE_TARGETS = [
  {
    envKey: 'AUTH_DATABASE_URL',
    databaseName: 'auth_db',
    schemaPath: 'prisma/authentication-identity-service/schema.prisma',
  },
  {
    envKey: 'USER_ROLE_DATABASE_URL',
    databaseName: 'user_role_db',
    schemaPath: 'prisma/user-role-management-service/schema.prisma',
  },
  {
    envKey: 'TASK_DATABASE_URL',
    databaseName: 'task_db',
    schemaPath: 'prisma/task-management-service/schema.prisma',
  },
  {
    envKey: 'DOCUMENT_DATABASE_URL',
    databaseName: 'document_db',
    schemaPath: 'prisma/document-management-service/schema.prisma',
  },
  {
    envKey: 'DOCUMENT_SECURITY_DATABASE_URL',
    databaseName: 'document_security_db',
    schemaPath: 'prisma/document-security-service/schema.prisma',
  },
  {
    envKey: 'PERMISSION_DATABASE_URL',
    databaseName: 'permission_db',
    schemaPath: 'prisma/permission-service/schema.prisma',
  },
  {
    envKey: 'AUDIT_DATABASE_URL',
    databaseName: 'audit_db',
    schemaPath: 'prisma/audit-log-service/schema.prisma',
  },
  {
    envKey: 'NOTIFICATION_DATABASE_URL',
    databaseName: 'notification_db',
    schemaPath: 'prisma/notification-service/schema.prisma',
  },
  {
    envKey: 'SECURITY_MONITORING_DATABASE_URL',
    databaseName: 'security_monitoring_db',
    schemaPath: 'prisma/security-monitoring-service/schema.prisma',
  },
];

function applyE2eEnvironmentDefaults(env) {
  const nextEnv = env;
  const pgBase = nextEnv.E2E_POSTGRES_BASE_URL || 'postgresql://c17:replace-me-local-only@localhost:5433';

  nextEnv.LOG_LEVEL = nextEnv.LOG_LEVEL ?? 'fatal';
  nextEnv.PORT = nextEnv.PORT ?? '3000';
  nextEnv.RABBITMQ_URL = nextEnv.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
  nextEnv.REDIS_URL = nextEnv.REDIS_URL ?? 'redis://localhost:6379';
  nextEnv.JWT_SECRET = nextEnv.JWT_SECRET ?? 'test-secret-32-chars-min-for-testing';
  nextEnv.JWT_TTL_SECONDS = nextEnv.JWT_TTL_SECONDS ?? '1800';
  nextEnv.PERMISSION_SERVICE_URL = nextEnv.PERMISSION_SERVICE_URL ?? 'http://localhost:3006';
  nextEnv.PERMISSION_CHECK_TIMEOUT_MS = nextEnv.PERMISSION_CHECK_TIMEOUT_MS ?? '2000';

  for (const target of E2E_DATABASE_TARGETS) {
    nextEnv[target.envKey] = nextEnv[target.envKey] ?? `${pgBase}/${target.databaseName}`;
  }

  return nextEnv;
}

function assertSafeResetEnvironment(env, targets) {
  if (env.NODE_ENV !== 'test') {
    throw new Error('Refusing destructive E2E reset unless NODE_ENV=test.');
  }

  for (const target of targets) {
    const rawUrl = env[target.envKey];
    if (!rawUrl) {
      throw new Error(`Missing required database URL: ${target.envKey}.`);
    }

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error(`${target.envKey} is not a valid URL.`);
    }

    if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
      throw new Error(`${target.envKey} must use the PostgreSQL protocol.`);
    }

    const databaseName = parsed.pathname.replace(/^\//, '');
    if (databaseName !== target.databaseName) {
      throw new Error(
        `${target.envKey} points to unexpected database "${databaseName}".`,
      );
    }

    if (!LOCAL_TEST_HOSTS.has(parsed.hostname)) {
      throw new Error(
        `${target.envKey} points to unexpected host "${parsed.hostname}".`,
      );
    }
  }
}

function runPnpm(args, env) {
  const npmExecPath = env.npm_execpath;

  if (npmExecPath) {
    execFileSync(process.execPath, [npmExecPath, ...args], { stdio: 'inherit', env });
    return;
  }

  execFileSync('pnpm', args, { stdio: 'inherit', env });
}

function resetDatabases(env, targets) {
  for (const target of targets) {
    console.log(`Resetting ${target.databaseName} with ${target.schemaPath}`);
    runPnpm(['exec', 'prisma', 'db', 'push', '--force-reset', '--skip-generate', '--schema', target.schemaPath], env);
  }
}

function seedDatabases(env) {
  execFileSync(process.execPath, ['infra/seed.js'], { stdio: 'inherit', env });
}

module.exports = {
  E2E_DATABASE_TARGETS,
  applyE2eEnvironmentDefaults,
  assertSafeResetEnvironment,
  resetDatabases,
  seedDatabases,
};
