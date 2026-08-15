import { Module } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { MessagingModule } from '@c17/messaging';
import { ObservabilityModule } from '@c17/observability';

import { PermissionsController } from './permissions/permissions.controller';
import { PermissionService } from './permissions/permission.service';
import { PermissionEventsConsumer } from './permissions/permission-events.consumer';
import { PermissionPrismaService } from './prisma/permission-prisma.service';
import { TaskContextClient } from './tasks/task-context.client';
import { TaskDocumentClient } from './tasks/task-document.client';

export const SERVICE = 'permission-service';

/** Sole authority for access decisions. Default deny, fail closed. */
export const envSchema = baseEnvSchema.extend({
  PERMISSION_DATABASE_URL: z.string().url(),
  TASK_SERVICE_URL: z.string().url().default('http://localhost:3003'),
  DOCUMENT_SERVICE_URL: z.string().url().default('http://localhost:3004'),
  TASK_LOOKUP_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  DOCUMENT_ASSOCIATION_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
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
  controllers: [PermissionsController],
  providers: [
    PermissionPrismaService,
    PermissionService,
    PermissionEventsConsumer,
    TaskContextClient,
    TaskDocumentClient,
  ],
})
export class AppModule {}
