import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { GatewayController } from './proxy/gateway.controller';
import { RateLimitGuard } from './rate-limit/rate-limit.guard';

export const SERVICE = 'api-gateway';

export const envSchema = baseEnvSchema.extend({
  JWT_SECRET: z.string().min(32),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
  GATEWAY_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
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
  controllers: [GatewayController],
  providers: [
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    JwtAuthGuard,
    RateLimitGuard,
  ],
})
export class AppModule {}
