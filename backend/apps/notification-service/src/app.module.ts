import { Module } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { EmailModule } from '@c17/email';
import { ObservabilityModule } from '@c17/observability';

import { NotificationsController } from './notifications/notifications.controller';
import { NotificationEventsConsumer } from './notifications/notification-events.consumer';
import { NotificationsService } from './notifications/notifications.service';
import { UserDirectoryClient } from './notifications/user-directory.client';
import { NotificationPrismaService } from './prisma/notification-prisma.service';

export const SERVICE = 'notification-service';

/** Delivers notifications. Delivery only; it never grants access. */
export const envSchema = baseEnvSchema.extend({
  NOTIFICATION_DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().url().default('amqp://guest:guest@localhost:5672'),
  USER_ROLE_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  USER_ROLE_LOOKUP_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  MAIL_HOST: z.string().default('smtp.gmail.com'),
  MAIL_PORT: z.coerce.number().int().positive().default(587),
  MAIL_SECURE: z.string().default('false'),
  MAIL_USER: z.string().min(1),
  MAIL_PASS: z.string().min(1),
  MAIL_FROM: z.string().optional(),
});

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    EmailModule,
    ObservabilityModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationPrismaService,
    NotificationsService,
    NotificationEventsConsumer,
    UserDirectoryClient,
  ],
})
export class AppModule {}
