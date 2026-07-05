import { Module } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';
import { MessagingModule } from '@c17/messaging';

import { DocumentsController, RecordsController, TransferPackagesController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { DocumentPrismaService } from './prisma/document-prisma.service';
import { PermissionClient } from './permissions/permission.client';
import { AuditClient } from './audit/audit.client';
import { SecurityClient } from './security/security.client';

export const SERVICE = 'document-management-service';

/** Owns documents, versions, records, and archival transfer. */
export const envSchema = baseEnvSchema.extend({
  DOCUMENT_DATABASE_URL: z.string().url(),
  PERMISSION_SERVICE_URL: z.string().url().default('http://localhost:3006'),
  PERMISSION_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  AUDIT_SERVICE_URL: z.string().url().default('http://localhost:3007'),
  AUDIT_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  DOCUMENT_SECURITY_URL: z.string().url().default('http://localhost:3005'),
  SECURITY_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  RABBITMQ_URL: z.string().url().default('amqp://guest:guest@localhost:5672'),
});

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
    MessagingModule.forRoot({
      url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
      inMemory: process.env.MESSAGING_IN_MEMORY === 'true',
    }),
  ],
  controllers: [DocumentsController, RecordsController, TransferPackagesController],
  providers: [DocumentPrismaService, DocumentsService, PermissionClient, AuditClient, SecurityClient],
})
export class AppModule {}
