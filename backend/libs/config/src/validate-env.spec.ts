import { z } from 'zod';

import { baseEnvSchema } from './env.schema';
import { EnvironmentValidationError, validateEnv } from './validate-env';

describe('validateEnv', () => {
  const valid = {
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    PORT: '3006',
    RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
  };

  it('coerces and returns a typed environment', () => {
    const env = validateEnv('permission-service', baseEnvSchema, valid);

    expect(env.PORT).toBe(3006);
    expect(env.NODE_ENV).toBe('test');
  });

  it('reports every problem at once, not just the first', () => {
    const attempt = () =>
      validateEnv('permission-service', baseEnvSchema, { PORT: 'not-a-number' });

    expect(attempt).toThrow(EnvironmentValidationError);
    try {
      attempt();
    } catch (error) {
      const issues = (error as EnvironmentValidationError).issues;
      expect(issues.some((issue) => issue.startsWith('PORT:'))).toBe(true);
      expect(issues.some((issue) => issue.startsWith('RABBITMQ_URL:'))).toBe(true);
    }
  });

  it('never echoes the offending value into the message', () => {
    const schema = baseEnvSchema.extend({ DB_PASSWORD: z.string().min(20) });

    const attempt = () =>
      validateEnv('permission-service', schema, { ...valid, DB_PASSWORD: 'hunter2' });

    expect(attempt).toThrow(/DB_PASSWORD/);
    expect(attempt).not.toThrow(/hunter2/);
  });
});
