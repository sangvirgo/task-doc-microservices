import { Module } from '@nestjs/common';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

export const SERVICE = 'api-gateway';

/** Edge entry point: validates access tokens and routes to internal services. */
export const envSchema = baseEnvSchema;

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
})
export class AppModule {}
