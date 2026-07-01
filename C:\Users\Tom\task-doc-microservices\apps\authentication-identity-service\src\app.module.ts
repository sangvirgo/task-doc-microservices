import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';

export const SERVICE = 'authentication-identity-service';

/** Owns credentials, sessions, and refresh-token rotation. */
export const envSchema = baseEnvSchema.extend({
  JWT_SECRET: z.string().min(32),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
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
  controllers: [AuthController],
  providers: [AuthService],
})
export class AppModule {}
