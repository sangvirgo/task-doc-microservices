import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { EventType } from '@c17/contracts';
import { AmqpEventConsumer, queueName } from '@c17/messaging';
import { StructuredLogger } from '@c17/observability';

import { SecurityMonitoringPrismaService } from '../prisma/security-monitoring-prisma.service';

@Injectable()
export class MonitoringEventsConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly consumer: AmqpEventConsumer;

  constructor(
    private readonly prisma: SecurityMonitoringPrismaService,
    logger: StructuredLogger,
  ) {
    this.consumer = new AmqpEventConsumer(
      process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
      logger,
    );
  }

  onModuleInit(): void {
    this.consumer.subscribe(
      {
        consumer: 'security-monitoring-service',
        concern: 'permission-denied',
        queue: queueName('security-monitoring-service', 'permission-denied'),
        routingKey: EventType.PERMISSION_DECISION_MADE,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        await this.prisma.$transaction(async (tx) => {
          const existing = await tx.consumedEvent.findUnique({
            where: { event_id: event.event_id },
          });
          if (existing) {
            return;
          }

          const allowed = event.payload.allowed;
          const actorId = event.actor_id;
          if (allowed === false && actorId) {
            const rules = await tx.securityRule.findMany({
              where: {
                enabled: true,
                rule_type: 'DENIED_CONTENT_ACCESS',
              },
            });

            for (const rule of rules) {
              const windowStart = new Date(
                Math.floor(Date.now() / (rule.window_minutes * 60_000)) *
                  (rule.window_minutes * 60_000),
              );

              const counter = await tx.securityEventCounter.upsert({
                where: {
                  rule_id_actor_id_window_start: {
                    rule_id: rule.id,
                    actor_id: actorId,
                    window_start: windowStart,
                  },
                },
                create: {
                  rule_id: rule.id,
                  actor_id: actorId,
                  window_start: windowStart,
                  count: 1,
                },
                update: { count: { increment: 1 } },
              });

              if (counter.count >= rule.threshold) {
                await tx.securityAlert.create({
                  data: {
                    rule_id: rule.id,
                    severity: rule.action === 'BLOCK' ? 'HIGH' : 'MEDIUM',
                    actor_id: actorId,
                    description: `Denied content access threshold reached for actor ${actorId}`,
                    metadata: {
                      count: counter.count,
                      threshold: rule.threshold,
                      reason_code:
                        typeof event.payload.reason_code === 'string'
                          ? event.payload.reason_code
                          : null,
                      correlation_id: event.correlation_id,
                    },
                  },
                });
              }
            }
          }

          await tx.consumedEvent.create({
            data: {
              event_id: event.event_id,
              event_type: event.event_type,
              resource_id: event.resource_id,
              metadata: {
                correlation_id: event.correlation_id,
              },
            },
          });
        });
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.consumer.onApplicationShutdown();
  }
}
