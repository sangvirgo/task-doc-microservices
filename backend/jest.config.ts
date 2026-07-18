import type { Config } from 'jest';

import { baseConfig } from './jest.base';

const config: Config = {
  ...baseConfig,
  testRegex: '.*\\.spec\\.ts$',
  collectCoverageFrom: ['apps/**/*.ts', 'libs/**/*.ts', '!**/*.spec.ts', '!**/*.e2e-spec.ts'],
  coverageDirectory: './coverage',
};

export default config;
