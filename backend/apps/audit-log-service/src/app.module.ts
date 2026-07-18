import { Module } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigModule, baseEnvSchema } from '@c17/config';
import { ObservabilityModule } from '@c17/observability';

import { AuditController } from './audit/audit.controller';
import { AuditConsumerService } from './audit/audit-consumer.service';
import { AuditService } from './audit/audit.service';
import { AuditPrismaService } from './prisma/audit-prisma.service';

export const SERVICE = 'audit-log-service';

/** Append-only, hash-chained evidence. Single writer, single replica. */
export const envSchema = baseEnvSchema.extend({
  AUDIT_DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().url().default('amqp://guest:guest@localhost:5672'),
});

@Module({
  imports: [
    AppConfigModule.forRoot({ serviceName: SERVICE, schema: envSchema }),
    ObservabilityModule,
  ],
  controllers: [AuditController],
  providers: [AuditPrismaService, AuditService, AuditConsumerService],
})
export class AppModule {}
