import { Module } from '@nestjs/common';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';
import { PermissionClient } from './permissions/permission.client';

export const SERVICE = 'task-management-service';

/** Owns tasks, the task hierarchy, participation, comments, and TaskActivity. */
export const envSchema = baseEnvSchema;

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
  controllers: [TasksController],
  providers: [TasksService, PermissionClient],
})
export class AppModule {}
