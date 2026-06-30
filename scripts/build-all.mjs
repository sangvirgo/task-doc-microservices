#!/usr/bin/env node
/**
 * Builds every application declared in nest-cli.json.
 *
 * `nest build` with no argument builds only the default project. Each of the ten applications is
 * independently deployable (V3 §4.1), so "the build passes" has to mean all ten compile, not one.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const nestCli = JSON.parse(readFileSync(new URL('../nest-cli.json', import.meta.url), 'utf8'));

const applications = Object.entries(nestCli.projects)
  .filter(([, project]) => project.type === 'application')
  .map(([name]) => name);

if (applications.length === 0) {
  console.error('nest-cli.json declares no applications');
  process.exit(1);
}

let failed = 0;

for (const application of applications) {
  process.stdout.write(`building ${application} ... `);
  try {
    execFileSync('nest', ['build', application], { stdio: 'pipe', shell: true });
    process.stdout.write('ok\n');
  } catch (error) {
    failed += 1;
    process.stdout.write('FAILED\n');
    process.stderr.write(String(error.stdout ?? '') + String(error.stderr ?? '') + '\n');
  }
}

console.log(`\n${applications.length - failed}/${applications.length} applications built`);
process.exit(failed === 0 ? 0 : 1);
