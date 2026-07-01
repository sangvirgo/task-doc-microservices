import { Module } from '@nestjs/common';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { AuditController } from './audit/audit.controller';

export const SERVICE = 'audit-log-service';

/** Append-only, hash-chained evidence. Single writer, single replica. */
export const envSchema = baseEnvSchema;

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
  controllers: [AuditController],
})
export class AppModule {}
