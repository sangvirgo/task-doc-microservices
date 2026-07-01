import { Module } from '@nestjs/common';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { PermissionsController } from './permissions/permissions.controller';

export const SERVICE = 'permission-service';

/** Sole authority for access decisions. Default deny, fail closed. */
export const envSchema = baseEnvSchema;

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
  controllers: [PermissionsController],
})
export class AppModule {}
