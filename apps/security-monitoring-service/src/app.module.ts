import { Module } from '@nestjs/common';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

export const SERVICE = 'security-monitoring-service';

/** Detects and alerts on anomalous access patterns. */
export const envSchema = baseEnvSchema;

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
})
export class AppModule {}
