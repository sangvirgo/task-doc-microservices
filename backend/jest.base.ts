import type { Config } from 'jest';

/** Path aliases from tsconfig.json, restated for Jest's resolver. */
export const moduleNameMapper: Record<string, string> = {
  '^@c17/contracts(|/.*)$': '<rootDir>/libs/contracts/src/$1',
  '^@c17/auth-context(|/.*)$': '<rootDir>/libs/auth-context/src/$1',
  '^@c17/config(|/.*)$': '<rootDir>/libs/config/src/$1',
  '^@c17/messaging(|/.*)$': '<rootDir>/libs/messaging/src/$1',
  '^@c17/observability(|/.*)$': '<rootDir>/libs/observability/src/$1',
  '^@c17/testing(|/.*)$': '<rootDir>/libs/testing/src/$1',
};

export const baseConfig: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleNameMapper,
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  clearMocks: true,
};
