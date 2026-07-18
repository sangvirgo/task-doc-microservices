import { Module } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { NotificationsController } from './notifications/notifications.controller';
import { NotificationEventsConsumer } from './notifications/notification-events.consumer';
import { NotificationsService } from './notifications/notifications.service';
import { NotificationPrismaService } from './prisma/notification-prisma.service';

export const SERVICE = 'notification-service';

/** Delivers notifications. Delivery only; it never grants access. */
export const envSchema = baseEnvSchema.extend({
  NOTIFICATION_DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().url().default('amqp://guest:guest@localhost:5672'),
});

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationPrismaService, NotificationsService, NotificationEventsConsumer],
})
export class AppModule {}
