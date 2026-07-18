const {
  E2E_DATABASE_TARGETS,
  applyE2eEnvironmentDefaults,
  assertSafeResetEnvironment,
  resetDatabases,
  seedDatabases,
} = require('../scripts/reset-e2e-state-lib.cjs');
const { loadLocalEnv } = require('./load-local-env');
export {};

module.exports = async () => {
  loadLocalEnv();
  process.env.NODE_ENV = 'test';
  applyE2eEnvironmentDefaults(process.env);
  assertSafeResetEnvironment(process.env, E2E_DATABASE_TARGETS);
  resetDatabases(process.env, E2E_DATABASE_TARGETS);
  seedDatabases(process.env);
};
