import type { Config } from 'jest';

import { baseConfig } from '../jest.base';

const config: Config = {
  ...baseConfig,
  rootDir: '..',
  testRegex: '.*\\.e2e-spec\\.ts$',
  testTimeout: 30_000,
  globalSetup: '<rootDir>/test/e2e-global-setup.ts',
};

export default config;
