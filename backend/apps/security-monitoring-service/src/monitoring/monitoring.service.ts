import { Inject, Injectable, Optional, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { buildEventEnvelope, EventType, Producer } from '@c17/contracts';
import { EVENT_PUBLISHER, type EventPublisher } from '@c17/messaging';

import { AuthAdminClient } from '../auth/auth-admin.client';
import { SecurityMonitoringPrismaService } from '../prisma/security-monitoring-prisma.service';

export interface SecurityAlertDto {
  id: string;
  rule_id: string;
  severity: string;
  actor_id: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  status: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface SecurityRuleDto {
  id: string;
  name: string;
  description: string | null;
  rule_type: string;
  threshold: number;
  window_minutes: number;
  enabled: boolean;
  action: string;
  created_at: string;
}

@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: SecurityMonitoringPrismaService,
    private readonly authAdminClient: AuthAdminClient,
    @Optional() @Inject(EVENT_PUBLISHER) private readonly eventPublisher?: EventPublisher,
  ) {}

  async recordEvent(
    rule_id: string,
    actor_id: string,
  ): Promise<{ triggered: boolean; alert_id?: string }> {
    const rule = await this.prisma.securityRule.findUnique({ where: { id: rule_id } });
    if (!rule || !rule.enabled) return { triggered: false };

    const windowStart = new Date(
      Math.floor(Date.now() / (rule.window_minutes * 60_000)) * (rule.window_minutes * 60_000),
    );

    const counter = await this.prisma.securityEventCounter.upsert({
      where: { rule_id_actor_id_window_start: { rule_id, actor_id, window_start: windowStart } },
      create: { rule_id, actor_id, window_start: windowStart, count: 1 },
      update: { count: { increment: 1 } },
    });

    if (counter.count >= rule.threshold) {
      const alert = await this.prisma.securityAlert.create({
        data: {
          rule_id,
          severity: rule.action === 'BLOCK' ? 'HIGH' : 'MEDIUM',
          actor_id,
          description: `Rule "${rule.name}" triggered: ${counter.count} events in ${rule.window_minutes}m window`,
          metadata: { count: counter.count, threshold: rule.threshold },
        },
      });
      return { triggered: true, alert_id: alert.id };
    }

    return { triggered: false };
  }

  async listAlerts(filters?: {
    status?: string;
    severity?: string;
    actor_id?: string;
    rule_id?: string;
  }): Promise<SecurityAlertDto[]> {
    const alerts = await this.prisma.securityAlert.findMany({
      where: {
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.severity ? { severity: filters.severity } : {}),
        ...(filters?.actor_id ? { actor_id: filters.actor_id } : {}),
        ...(filters?.rule_id ? { rule_id: filters.rule_id } : {}),
      },
      orderBy: { created_at: 'desc' },
    });
    return alerts.map((a) => this.toAlertDto(a));
  }

  async getAlert(id: string): Promise<SecurityAlertDto> {
    const alert = await this.prisma.securityAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');
    return this.toAlertDto(alert);
  }

  async resolveAlert(id: string, resolved_by: string): Promise<SecurityAlertDto> {
    const alert = await this.prisma.securityAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');

    const updated = await this.prisma.securityAlert.update({
      where: { id },
      data: { status: 'RESOLVED', resolved_at: new Date(), resolved_by },
    });
    return this.toAlertDto(updated);
  }

  async createRule(data: {
    name: string;
    description?: string;
    rule_type: string;
    threshold?: number;
    window_minutes?: number;
    action?: string;
  }): Promise<SecurityRuleDto> {
    const rule = await this.prisma.securityRule.create({
      data: {
        name: data.name,
        description: data.description || null,
        rule_type: data.rule_type,
        threshold: data.threshold ?? 5,
        window_minutes: data.window_minutes ?? 15,
        action: data.action ?? 'ALERT',
      },
    });
    return this.toRuleDto(rule);
  }

  async listRules(): Promise<SecurityRuleDto[]> {
    const rules = await this.prisma.securityRule.findMany({ orderBy: { name: 'asc' } });
    return rules.map((r) => this.toRuleDto(r));
  }

  async toggleRule(id: string, enabled: boolean): Promise<SecurityRuleDto> {
    const rule = await this.prisma.securityRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Rule not found');

    const updated = await this.prisma.securityRule.update({ where: { id }, data: { enabled } });
    return this.toRuleDto(updated);
  }

  async handleRepeatedFailedLogin(event: {
    actor_id: string | null;
    correlation_id: string;
    resource_id: string;
    occurred_at: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (!event.actor_id) {
      return;
    }

    await this.processRuleType({
      actorId: event.actor_id,
      ruleType: 'FAILED_LOGIN',
      description: 'Repeated failed login threshold reached',
      correlationId: event.correlation_id,
      occurredAt: event.occurred_at,
      resourceId: event.resource_id,
      metadata: {
        reason_code:
          typeof event.payload.reason_code === 'string' ? event.payload.reason_code : null,
      },
    });
  }

  async handlePermissionDenied(event: {
    actor_id: string | null;
    correlation_id: string;
    resource_id: string;
    occurred_at: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (!event.actor_id || event.payload.allowed !== false) {
      return;
    }

    await this.processRuleType({
      actorId: event.actor_id,
      ruleType: 'DENIED_CONTENT_ACCESS',
      description: 'Repeated denied content access threshold reached',
      correlationId: event.correlation_id,
      occurredAt: event.occurred_at,
      resourceId: event.resource_id,
      metadata: {
        action: typeof event.payload.action === 'string' ? event.payload.action : null,
        reason_code:
          typeof event.payload.reason_code === 'string' ? event.payload.reason_code : null,
      },
    });
  }

  private async processRuleType(input: {
    actorId: string;
    ruleType: string;
    description: string;
    correlationId: string;
    occurredAt: string;
    resourceId: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const rules = await this.prisma.securityRule.findMany({
      where: {
        enabled: true,
        rule_type: input.ruleType,
      },
      orderBy: { created_at: 'asc' },
    });

    for (const rule of rules) {
      const windowMs = rule.window_minutes * 60_000;
      const occurredAt = new Date(input.occurredAt);
      const windowStart = new Date(Math.floor(occurredAt.getTime() / windowMs) * windowMs);

      const outcome = await this.prisma.$transaction(async (tx) => {
        const counter = await tx.securityEventCounter.upsert({
          where: {
            rule_id_actor_id_window_start: {
              rule_id: rule.id,
              actor_id: input.actorId,
              window_start: windowStart,
            },
          },
          create: {
            rule_id: rule.id,
            actor_id: input.actorId,
            window_start: windowStart,
            count: 1,
          },
          update: { count: { increment: 1 } },
        });

        if (counter.count < rule.threshold) {
          return null;
        }

        const existingAlert = await tx.securityAlert.findFirst({
          where: {
            rule_id: rule.id,
            actor_id: input.actorId,
            status: 'OPEN',
          },
          orderBy: { created_at: 'asc' },
        });

        if (existingAlert) {
          return rule.action === 'BLOCK'
            ? {
                alertId: existingAlert.id,
                severity: existingAlert.severity,
                shouldBlock: true,
              }
            : null;
        }

        const alert = await tx.securityAlert.create({
          data: {
            rule_id: rule.id,
            severity: rule.action === 'BLOCK' ? 'HIGH' : 'MEDIUM',
            actor_id: input.actorId,
            description: input.description,
            metadata: {
              count: counter.count,
              threshold: rule.threshold,
              window_start: windowStart.toISOString(),
              rule_type: rule.rule_type,
              correlation_id: input.correlationId,
              resource_id: input.resourceId,
              ...input.metadata,
            },
          },
        });

        return {
          alertId: alert.id,
          severity: alert.severity,
          shouldBlock: rule.action === 'BLOCK',
        };
      });

      if (!outcome) {
        continue;
      }

      if (outcome.shouldBlock) {
        await this.authAdminClient.revokeAllSessions(input.actorId);
      }

      void this.eventPublisher
        ?.publish(
          buildEventEnvelope({
            event_id: randomUUID(),
            event_type: EventType.SECURITY_ALERT_CREATED,
            occurred_at: new Date().toISOString(),
            producer: Producer.SECURITY_MONITORING_SERVICE,
            correlation_id: input.correlationId,
            actor_id: input.actorId,
            resource_type: 'SECURITY_ALERT',
            resource_id: outcome.alertId,
            payload: {
              severity: outcome.severity,
              rule_type: input.ruleType,
              status: 'OPEN',
            },
          }),
        )
        .catch(() => undefined);
    }
  }

  private toAlertDto(alert: {
    id: string;
    rule_id: string;
    severity: string;
    actor_id: string | null;
    description: string;
    metadata: unknown;
    status: string;
    resolved_at: Date | null;
    resolved_by: string | null;
    created_at: Date;
  }): SecurityAlertDto {
    return {
      id: alert.id,
      rule_id: alert.rule_id,
      severity: alert.severity,
      actor_id: alert.actor_id,
      description: alert.description,
      metadata: alert.metadata as Record<string, unknown> | null,
      status: alert.status,
      resolved_at: alert.resolved_at?.toISOString() ?? null,
      resolved_by: alert.resolved_by,
      created_at: alert.created_at.toISOString(),
    };
  }

  private toRuleDto(rule: {
    id: string;
    name: string;
    description: string | null;
    rule_type: string;
    threshold: number;
    window_minutes: number;
    enabled: boolean;
    action: string;
    created_at: Date;
  }): SecurityRuleDto {
    return {
      id: rule.id,
      name: rule.name,
      description: rule.description,
      rule_type: rule.rule_type,
      threshold: rule.threshold,
      window_minutes: rule.window_minutes,
      enabled: rule.enabled,
      action: rule.action,
      created_at: rule.created_at.toISOString(),
    };
  }
}
