import { Module } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { MonitoringController } from './monitoring/monitoring.controller';
import { MonitoringEventsConsumer } from './monitoring/monitoring-events.consumer';
import { MonitoringService } from './monitoring/monitoring.service';
import { SecurityMonitoringPrismaService } from './prisma/security-monitoring-prisma.service';

export const SERVICE = 'security-monitoring-service';

/** Detects and alerts on anomalous access patterns. */
export const envSchema = baseEnvSchema.extend({
  SECURITY_MONITORING_DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().url().default('amqp://guest:guest@localhost:5672'),
});

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
  controllers: [MonitoringController],
  providers: [SecurityMonitoringPrismaService, MonitoringService, MonitoringEventsConsumer],
})
export class AppModule {}
