const {
  E2E_DATABASE_TARGETS,
  applyE2eEnvironmentDefaults,
  assertSafeResetEnvironment,
  resetDatabases,
  seedDatabases,
} = require('../scripts/reset-e2e-state-lib.cjs');
export {};

module.exports = async () => {
  applyE2eEnvironmentDefaults(process.env);
  assertSafeResetEnvironment(process.env, E2E_DATABASE_TARGETS);
  resetDatabases(process.env, E2E_DATABASE_TARGETS);
  seedDatabases(process.env);
};
