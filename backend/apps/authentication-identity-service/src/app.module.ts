import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { EmailModule } from '@c17/email';
import { MessagingModule } from '@c17/messaging';
import { ObservabilityModule } from '@c17/observability';

import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthPrismaService } from './prisma/auth-prisma.service';
import { RedisService } from './redis/redis.service';
import { UserRoleClient } from './users/user-role.client';

export const SERVICE = 'authentication-identity-service';

export const envSchema = baseEnvSchema.extend({
  JWT_SECRET: z.string().min(32),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
  AUTH_DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  USER_ROLE_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  USER_ROLE_LOOKUP_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  RABBITMQ_URL: z.string().url().default('amqp://guest:guest@localhost:5672'),
  MAIL_HOST: z.string().default('smtp.gmail.com'),
  MAIL_PORT: z.coerce.number().int().positive().default(587),
  MAIL_SECURE: z.string().default('false'),
  MAIL_USER: z.string().min(1),
  MAIL_PASS: z.string().min(1),
  MAIL_FROM: z.string().optional(),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  OTP_RESEND_SECONDS: z.coerce.number().int().positive().default(60),
});

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    EmailModule,
    ObservabilityModule,
    MessagingModule.forRoot({
      url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
      inMemory: process.env.MESSAGING_IN_MEMORY === 'true',
    }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-min-32-chars-required',
      signOptions: { expiresIn: Number(process.env.JWT_TTL_SECONDS ?? 1800) },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthPrismaService, RedisService, UserRoleClient],
})
export class AppModule {}
