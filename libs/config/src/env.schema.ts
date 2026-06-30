import { z } from 'zod';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

/**
 * Every application validates at least this much of its environment at boot.
 *
 * A service that needs more composes its own schema with `baseEnvSchema.extend(...)` or by
 * merging one of the fragments below. Validation is fail-fast: an application with an invalid
 * environment must refuse to start rather than start and misbehave later.
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  PORT: z.coerce.number().int().min(1).max(65535),
  RABBITMQ_URL: z.string().url(),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

/** For a service that owns a PostgreSQL database (V3 §7). */
export const databaseEnvFragment = z.object({
  DATABASE_URL: z.string().url(),
});

/** For a service that reads or writes Redis session metadata. */
export const redisEnvFragment = z.object({
  REDIS_URL: z.string().url(),
});

/** For a service that calls Permission Service (V3 §8.1). */
export const permissionClientEnvFragment = z.object({
  PERMISSION_SERVICE_URL: z.string().url(),
  PERMISSION_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
});

/** For a service that stores objects in MinIO. */
export const objectStorageEnvFragment = z.object({
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().min(1).max(65535),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

/** For the malware scan stage of the security pipeline (V3 §5.6). */
export const clamavEnvFragment = z.object({
  CLAMAV_HOST: z.string().min(1),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535),
});
