import { Module } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { MessagingModule } from '@c17/messaging';
import { ObservabilityModule } from '@c17/observability';

import { AuthAdminClient } from './auth/auth-admin.client';
import { MonitoringController } from './monitoring/monitoring.controller';
import { MonitoringEventsConsumer } from './monitoring/monitoring-events.consumer';
import { MonitoringService } from './monitoring/monitoring.service';
import { SecurityMonitoringPrismaService } from './prisma/security-monitoring-prisma.service';

export const SERVICE = 'security-monitoring-service';

/** Detects and alerts on anomalous access patterns. */
export const envSchema = baseEnvSchema.extend({
  SECURITY_MONITORING_DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().url().default('amqp://guest:guest@localhost:5672'),
  AUTHENTICATION_IDENTITY_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  SECURITY_MONITORING_CONSUMER_NAME: z.string().min(1).default(SERVICE),
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
  controllers: [MonitoringController],
  providers: [
    SecurityMonitoringPrismaService,
    MonitoringService,
    MonitoringEventsConsumer,
    AuthAdminClient,
  ],
})
export class AppModule {}
