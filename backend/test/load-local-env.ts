import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function loadLocalEnv(): void {
  const root = process.cwd();
  const envPath = existsSync(join(root, '.env')) ? join(root, '.env') : join(root, '.env.example');
  const source = readFileSync(envPath, 'utf8');

  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] = value;
  }
}
