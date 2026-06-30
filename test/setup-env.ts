/**
 * A valid environment for every service under test.
 *
 * Application root modules validate the environment when their module file is evaluated, which
 * happens on import — before any `beforeAll` could set a variable. Setting it here, in a Jest
 * `setupFiles` entry, is what makes importing an `AppModule` in a test possible at all.
 *
 * These values are non-secrets pointing at nothing. No real credential belongs in this file.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'fatal';
process.env.PORT = process.env.PORT ?? '3000';
process.env.RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
