import { Module } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';
import { MessagingModule } from '@c17/messaging';

import {
  DocumentsController,
  RecordsController,
  TransferPackagesController,
  RetentionDisposalController,
} from './documents/documents.controller';
import {
  InternalTaskDocumentsController,
  TaskDocumentsController,
} from './tasks/task-documents.controller';
import { DocumentsService } from './documents/documents.service';
import { DocumentPrismaService } from './prisma/document-prisma.service';
import { PermissionClient } from './permissions/permission.client';
import { AuditClient } from './audit/audit.client';
import { SecurityClient } from './security/security.client';
import { DocumentOutboxRelayService } from './messaging/document-outbox-relay.service';
import { TaskContextClient } from './tasks/task-context.client';
import { TaskDocumentsService } from './tasks/task-documents.service';
import { DocumentStatisticsService } from './documents/document-statistics.service';

export const SERVICE = 'document-management-service';

/** Owns documents, versions, records, and archival transfer. */
export const envSchema = baseEnvSchema.extend({
  DOCUMENT_DATABASE_URL: z.string().url(),
  PERMISSION_SERVICE_URL: z.string().url().default('http://localhost:3006'),
  PERMISSION_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  AUDIT_SERVICE_URL: z.string().url().default('http://localhost:3007'),
  AUDIT_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  DOCUMENT_SECURITY_URL: z.string().url().default('http://localhost:3005'),
  TASK_SERVICE_URL: z.string().url().default('http://localhost:3003'),
  TASK_LOOKUP_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  SECURITY_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  PREVIEW_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),
  RABBITMQ_URL: z.string().url().default('amqp://guest:guest@localhost:5672'),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  OUTBOX_RETRY_DELAY_MS: z.coerce.number().int().positive().default(2000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(20),
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
  controllers: [
    DocumentsController,
    TaskDocumentsController,
    InternalTaskDocumentsController,
    RecordsController,
    TransferPackagesController,
    RetentionDisposalController,
  ],
  providers: [
    DocumentPrismaService,
    DocumentsService,
    PermissionClient,
    AuditClient,
    SecurityClient,
    DocumentOutboxRelayService,
    TaskContextClient,
    TaskDocumentsService,
    DocumentStatisticsService,
  ],
})
export class AppModule {}
