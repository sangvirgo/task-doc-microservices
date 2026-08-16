import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema, objectStorageEnvFragment } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { InfraController } from './infra/infra.controller';
import { InfraService } from './infra/infra.service';
import { GatewayController } from './proxy/gateway.controller';
import { RateLimitGuard } from './rate-limit/rate-limit.guard';
import { StatisticsController } from './statistics/statistics.controller';
import { StatisticsService } from './statistics/statistics.service';

export const SERVICE = 'api-gateway';

export const envSchema = baseEnvSchema.extend({
  ...objectStorageEnvFragment.shape,
  JWT_SECRET: z.string().min(32),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
  GATEWAY_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  GATEWAY_PREVIEW_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  STATISTICS_CACHE_TTL_MS: z.coerce.number().int().positive().default(30_000),
  STATISTICS_CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(200),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  USER_ROLE_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  TASK_SERVICE_URL: z.string().url().default('http://localhost:3003'),
  DOCUMENT_SERVICE_URL: z.string().url().default('http://localhost:3004'),
  DOCUMENT_SECURITY_SERVICE_URL: z.string().url().default('http://localhost:3005'),
  PERMISSION_SERVICE_URL: z.string().url().default('http://localhost:3006'),
  AUDIT_SERVICE_URL: z.string().url().default('http://localhost:3007'),
  NOTIFICATION_SERVICE_URL: z.string().url().default('http://localhost:3008'),
  SECURITY_MONITORING_SERVICE_URL: z.string().url().default('http://localhost:3009'),
});

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-min-32-chars-required',
      signOptions: { expiresIn: Number(process.env.JWT_TTL_SECONDS ?? 1800) },
    }),
  ],
  controllers: [GatewayController, StatisticsController, InfraController],
  providers: [
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    JwtAuthGuard,
    RateLimitGuard,
    StatisticsService,
    InfraService,
  ],
})
export class AppModule {}
