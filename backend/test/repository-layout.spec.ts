import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SERVICE_NAMES } from '@c17/contracts';

const repoRoot = join(__dirname, '..', '..');
const backendRoot = join(__dirname, '..');

/**
 * V3 §4.1 settles a conflict in V2: this repository is a NestJS monorepo managed by pnpm, not a
 * pnpm workspace. The difference is invisible until someone adds a per-app `package.json`, at
 * which point the two layouts start fighting. These assertions make that regression a test failure.
 */
describe('repository layout', () => {
  it('has pnpm-workspace.yaml at repository root', () => {
    expect(existsSync(join(repoRoot, 'pnpm-workspace.yaml'))).toBe(true);
  });

  it('has exactly one package.json in backend/', () => {
    for (const directory of ['apps', 'libs']) {
      for (const project of readdirSync(join(backendRoot, directory))) {
        expect(existsSync(join(backendRoot, directory, project, 'package.json'))).toBe(false);
      }
    }

    expect(existsSync(join(backendRoot, 'package.json'))).toBe(true);
  });

  it('has one application directory per declared service', () => {
    const appDirectories = readdirSync(join(backendRoot, 'apps')).sort();

    expect(appDirectories).toEqual([...SERVICE_NAMES].sort());
  });

  it('declares every application in nest-cli.json', async () => {
    const nestCli = (await import(join(backendRoot, 'nest-cli.json'))) as {
      projects: Record<string, { type: string }>;
    };

    const applications = Object.entries(nestCli.projects)
      .filter(([, project]) => project.type === 'application')
      .map(([name]) => name)
      .sort();

    expect(applications).toEqual([...SERVICE_NAMES].sort());
  });
});
