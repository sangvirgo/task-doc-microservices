import { Module } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { DocumentsController, RecordsController, TransferPackagesController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { DocumentPrismaService } from './prisma/document-prisma.service';
import { PermissionClient } from './permissions/permission.client';

export const SERVICE = 'document-management-service';

/** Owns documents, versions, records, and archival transfer. */
export const envSchema = baseEnvSchema.extend({
  DOCUMENT_DATABASE_URL: z.string().url(),
  PERMISSION_SERVICE_URL: z.string().url().default('http://localhost:3006'),
  PERMISSION_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
});

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
  controllers: [DocumentsController, RecordsController, TransferPackagesController],
  providers: [DocumentPrismaService, DocumentsService, PermissionClient],
})
export class AppModule {}
