import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';
import { MessagingModule } from '@c17/messaging';

import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';
import { PermissionClient } from './permissions/permission.client';
import { AuditClient } from './audit/audit.client';
import { TaskPrismaService } from './prisma/task-prisma.service';
import { UserRoleClient } from './users/user-role.client';
import { DeadlineReminderScheduler } from './messaging/deadline-reminder.scheduler';
import { TaskOutboxRelayService } from './messaging/task-outbox-relay.service';
import { TaskStatisticsService } from './tasks/task-statistics.service';

export const SERVICE = 'task-management-service';

/** Owns tasks, the task hierarchy, participation, comments, and TaskActivity. */
export const envSchema = baseEnvSchema.extend({
  TASK_DATABASE_URL: z.string().url(),
  PERMISSION_SERVICE_URL: z.string().url().default('http://localhost:3006'),
  PERMISSION_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  USER_ROLE_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  USER_ROLE_LOOKUP_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  AUDIT_SERVICE_URL: z.string().url().default('http://localhost:3007'),
  AUDIT_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  RABBITMQ_URL: z.string().url().default('amqp://guest:guest@localhost:5672'),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  OUTBOX_RETRY_DELAY_MS: z.coerce.number().int().positive().default(2000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(20),
});

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
    MessagingModule.forRoot({
      url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
      inMemory: process.env.MESSAGING_IN_MEMORY === 'true',
    }),
  ],
  controllers: [TasksController],
  providers: [
    TaskPrismaService,
    TasksService,
    PermissionClient,
    AuditClient,
    UserRoleClient,
    TaskOutboxRelayService,
    DeadlineReminderScheduler,
    TaskStatisticsService,
  ],
})
export class AppModule {}
