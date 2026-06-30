import { Module } from '@nestjs/common';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

export const SERVICE = 'task-management-service';

/** Owns tasks, the task hierarchy, participation, comments, and TaskActivity. */
export const envSchema = baseEnvSchema;

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
})
export class AppModule {}
