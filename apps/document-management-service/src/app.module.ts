import { Module } from '@nestjs/common';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { DocumentsController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { PermissionClient } from './permissions/permission.client';

export const SERVICE = 'document-management-service';

/** Owns documents, versions, records, and archival transfer. */
export const envSchema = baseEnvSchema;

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, PermissionClient],
})
export class AppModule {}
