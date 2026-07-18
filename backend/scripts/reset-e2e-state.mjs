#!/usr/bin/env node
import {
  E2E_DATABASE_TARGETS,
  applyE2eEnvironmentDefaults,
  assertSafeResetEnvironment,
  resetDatabases,
  seedDatabases,
} from './reset-e2e-state-lib.cjs';

const skipSeed = process.argv.includes('--skip-seed');

try {
  applyE2eEnvironmentDefaults(process.env);
  assertSafeResetEnvironment(process.env, E2E_DATABASE_TARGETS);

  console.log('Resetting E2E databases to a deterministic baseline...');
  resetDatabases(process.env, E2E_DATABASE_TARGETS);

  if (!skipSeed) {
    console.log('Seeding E2E databases...');
    seedDatabases(process.env);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
