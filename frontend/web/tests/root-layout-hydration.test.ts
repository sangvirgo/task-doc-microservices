import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('RootLayout extension hydration guard', () => {
  it('removes browser-extension hydration attributes before React starts', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8');

    expect(source).toContain('strategy="beforeInteractive"');
    expect(source).toContain('bis_skin_checked');
    expect(source).toContain('bis_register');
    expect(source).toContain('__processed_');
  });
});
