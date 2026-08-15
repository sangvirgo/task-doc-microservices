/**
 * A minimal valid environment for a service under test. Spread it and override the one variable
 * a test is actually about, so an unrelated schema addition does not break every suite.
 */
export function baseTestEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    PORT: '3000',
    RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
    ...overrides,
  };
}
