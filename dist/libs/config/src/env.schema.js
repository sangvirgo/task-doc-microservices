"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clamavEnvFragment = exports.objectStorageEnvFragment = exports.permissionClientEnvFragment = exports.redisEnvFragment = exports.databaseEnvFragment = exports.baseEnvSchema = exports.LOG_LEVELS = void 0;
const zod_1 = require("zod");
exports.LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
exports.baseEnvSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: zod_1.z.enum(exports.LOG_LEVELS).default('info'),
    PORT: zod_1.z.coerce.number().int().min(1).max(65535),
    RABBITMQ_URL: zod_1.z.string().url(),
});
exports.databaseEnvFragment = zod_1.z.object({
    DATABASE_URL: zod_1.z.string().url(),
});
exports.redisEnvFragment = zod_1.z.object({
    REDIS_URL: zod_1.z.string().url(),
});
exports.permissionClientEnvFragment = zod_1.z.object({
    PERMISSION_SERVICE_URL: zod_1.z.string().url(),
    PERMISSION_CHECK_TIMEOUT_MS: zod_1.z.coerce.number().int().positive().default(2000),
});
exports.objectStorageEnvFragment = zod_1.z.object({
    MINIO_ENDPOINT: zod_1.z.string().min(1),
    MINIO_PORT: zod_1.z.coerce.number().int().min(1).max(65535),
    MINIO_ACCESS_KEY: zod_1.z.string().min(1),
    MINIO_SECRET_KEY: zod_1.z.string().min(1),
    MINIO_USE_SSL: zod_1.z
        .enum(['true', 'false'])
        .default('false')
        .transform((value) => value === 'true'),
});
exports.clamavEnvFragment = zod_1.z.object({
    CLAMAV_HOST: zod_1.z.string().min(1),
    CLAMAV_PORT: zod_1.z.coerce.number().int().min(1).max(65535),
});
//# sourceMappingURL=env.schema.js.map