import { Module } from '@nestjs/common';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { UsersController } from './users/users.controller';

export const SERVICE = 'user-role-management-service';

/** Owns users, departments, system roles, and capabilities. */
export const envSchema = baseEnvSchema;

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
  controllers: [UsersController],
})
export class AppModule {}
