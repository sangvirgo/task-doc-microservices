import { Module } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';
import { PermissionClient } from './permissions/permission.client';
import { TaskPrismaService } from './prisma/task-prisma.service';

export const SERVICE = 'task-management-service';

/** Owns tasks, the task hierarchy, participation, comments, and TaskActivity. */
export const envSchema = baseEnvSchema.extend({
  TASK_DATABASE_URL: z.string().url(),
  PERMISSION_SERVICE_URL: z.string().url().default('http://localhost:3006'),
  PERMISSION_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
});

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
  controllers: [TasksController],
  providers: [TaskPrismaService, TasksService, PermissionClient],
})
export class AppModule {}
