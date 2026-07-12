import { Module } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { PermissionsController } from './permissions/permissions.controller';
import { PermissionService } from './permissions/permission.service';
import { PermissionEventsConsumer } from './permissions/permission-events.consumer';
import { PermissionPrismaService } from './prisma/permission-prisma.service';

export const SERVICE = 'permission-service';

/** Sole authority for access decisions. Default deny, fail closed. */
export const envSchema = baseEnvSchema.extend({
  PERMISSION_DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().url().default('amqp://guest:guest@localhost:5672'),
});

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
  controllers: [PermissionsController],
  providers: [PermissionPrismaService, PermissionService, PermissionEventsConsumer],
})
export class AppModule {}
