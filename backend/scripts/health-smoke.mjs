#!/usr/bin/env node
/**
 * Starts each built application on its own port, calls /health, and stops it.
 *
 * The e2e suites exercise the HTTP layer in-process. This one answers the separate question the
 * Phase 1 checklist asks: does each of the ten start independently, from its own build output,
 * with nothing else running?
 *
 * Usage: node scripts/health-smoke.mjs [--json <path>]
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const SERVICES = [
  ['api-gateway', 3000],
  ['authentication-identity-service', 3001],
  ['user-role-management-service', 3002],
  ['task-management-service', 3003],
  ['document-management-service', 3004],
  ['document-security-service', 3005],
  ['permission-service', 3006],
  ['audit-log-service', 3007],
  ['notification-service', 3008],
  ['security-monitoring-service', 3009],
];

const STARTUP_TIMEOUT_MS = 20_000;

const jsonFlagIndex = process.argv.indexOf('--json');
const jsonPath = jsonFlagIndex === -1 ? null : process.argv[jsonFlagIndex + 1];

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  RABBITMQ_URL: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
};

const results = [];
let failed = 0;

for (const [service, port] of SERVICES) {
  const entry = `dist/apps/${service}/src/main.js`;

  if (!existsSync(entry)) {
    console.error(`${service}: ${entry} missing — run pnpm build first`);
    results.push({ service, port, ok: false, error: 'build output missing' });
    failed += 1;
    continue;
  }

  const child = spawn('node', [entry], { env: { ...env, PORT: String(port) }, stdio: 'ignore' });

  try {
    const body = await waitForHealth(port, child);
    const ok = body?.status === 'ok' && body?.service === service;
    if (!ok) failed += 1;
    results.push({ service, port, ok, response: body });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${service} :${port} ${JSON.stringify(body)}`);
  } catch (error) {
    failed += 1;
    results.push({ service, port, ok: false, error: String(error.message ?? error) });
    console.log(`FAIL ${service} :${port} ${error.message ?? error}`);
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit', 5000);
  }
}

if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify(results, null, 2) + '\n');
}

console.log(`\n${SERVICES.length - failed}/${SERVICES.length} services responded healthy`);
process.exit(failed === 0 ? 0 : 1);

async function waitForHealth(port, child) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`process exited with code ${child.exitCode} before serving /health`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return await response.json();
    } catch {
      // not listening yet
    }

    await sleep(250);
  }

  throw new Error(`no healthy response within ${STARTUP_TIMEOUT_MS}ms`);
}

function once(emitter, event, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    emitter.once(event, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
