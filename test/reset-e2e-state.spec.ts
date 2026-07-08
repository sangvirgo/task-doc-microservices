const {
  E2E_DATABASE_TARGETS,
  assertSafeResetEnvironment,
} = require('../scripts/reset-e2e-state-lib.cjs');

describe('assertSafeResetEnvironment', () => {
  const validEnv = {
    NODE_ENV: 'test',
    AUTH_DATABASE_URL: 'postgresql://c17:replace-me-local-only@localhost:5433/auth_db',
    USER_ROLE_DATABASE_URL: 'postgresql://c17:replace-me-local-only@localhost:5433/user_role_db',
    TASK_DATABASE_URL: 'postgresql://c17:replace-me-local-only@localhost:5433/task_db',
    DOCUMENT_DATABASE_URL: 'postgresql://c17:replace-me-local-only@localhost:5433/document_db',
    DOCUMENT_SECURITY_DATABASE_URL:
      'postgresql://c17:replace-me-local-only@localhost:5433/document_security_db',
    PERMISSION_DATABASE_URL: 'postgresql://c17:replace-me-local-only@localhost:5433/permission_db',
    AUDIT_DATABASE_URL: 'postgresql://c17:replace-me-local-only@localhost:5433/audit_db',
    NOTIFICATION_DATABASE_URL:
      'postgresql://c17:replace-me-local-only@localhost:5433/notification_db',
    SECURITY_MONITORING_DATABASE_URL:
      'postgresql://c17:replace-me-local-only@localhost:5433/security_monitoring_db',
  };

  it('accepts the expected local docker test databases', () => {
    expect(() => assertSafeResetEnvironment(validEnv, E2E_DATABASE_TARGETS)).not.toThrow();
  });

  it('rejects reset when NODE_ENV is not test', () => {
    expect(() =>
      assertSafeResetEnvironment({ ...validEnv, NODE_ENV: 'development' }, E2E_DATABASE_TARGETS),
    ).toThrow('Refusing destructive E2E reset unless NODE_ENV=test.');
  });

  it('rejects reset when NODE_ENV is absent', () => {
    const { NODE_ENV: _nodeEnv, ...envWithoutNodeEnv } = validEnv;
    expect(() => assertSafeResetEnvironment(envWithoutNodeEnv, E2E_DATABASE_TARGETS)).toThrow(
      'Refusing destructive E2E reset unless NODE_ENV=test.',
    );
  });

  it('rejects non-local database hosts', () => {
    expect(() =>
      assertSafeResetEnvironment(
        {
          ...validEnv,
          AUDIT_DATABASE_URL: 'postgresql://c17:replace-me-local-only@db.internal:5433/audit_db',
        },
        E2E_DATABASE_TARGETS,
      ),
    ).toThrow('AUDIT_DATABASE_URL points to unexpected host "db.internal".');
  });

  it('rejects unexpected database names', () => {
    expect(() =>
      assertSafeResetEnvironment(
        {
          ...validEnv,
          TASK_DATABASE_URL: 'postgresql://c17:replace-me-local-only@localhost:5433/app_db',
        },
        E2E_DATABASE_TARGETS,
      ),
    ).toThrow('TASK_DATABASE_URL points to unexpected database "app_db".');
  });
});
