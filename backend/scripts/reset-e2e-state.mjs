#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  E2E_DATABASE_TARGETS,
  applyE2eEnvironmentDefaults,
  assertSafeResetEnvironment,
  resetDatabases,
  seedDatabases,
} from './reset-e2e-state-lib.cjs';

const skipSeed = process.argv.includes('--skip-seed');

function loadEnv() {
  const root = process.cwd();
  const envPath = existsSync(join(root, '.env')) ? join(root, '.env') : join(root, '.env.example');
  if (!existsSync(envPath)) return;
  const source = readFileSync(envPath, 'utf8');
  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

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
