import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { isAdmin, type AuthContext } from '@c17/auth-context';
import { z } from 'zod';

import { SecurityMonitoringPrismaService } from '../prisma/security-monitoring-prisma.service';

export interface MonitoringStatisticsResult {
  security_alerts: number;
  open_alerts?: number;
}

export interface MonitoringStatisticsInput {
  scope: 'ME' | 'ORGANIZATION';
  from: Date;
  toExclusive: Date;
  caller: AuthContext;
}

const internalQuerySchema = z
  .object({
    scope: z.enum(['ME', 'ORGANIZATION']),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export function parseMonitoringStatisticsQuery(query: Record<string, unknown>): {
  scope: 'ME' | 'ORGANIZATION';
  from: Date;
  toExclusive: Date;
} {
  const parsed = internalQuerySchema.safeParse(query);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);

  const from = new Date(`${parsed.data.from}T00:00:00.000Z`);
  const toExclusive = new Date(`${parsed.data.to}T00:00:00.000Z`);
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(toExclusive.getTime()) ||
    from.toISOString().slice(0, 10) !== parsed.data.from ||
    toExclusive.toISOString().slice(0, 10) !== parsed.data.to
  ) {
    throw new BadRequestException('Invalid calendar date');
  }
  if (from > toExclusive) throw new BadRequestException('`to` must be on or after `from`');
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  if (toExclusive.getTime() - from.getTime() > 90 * 24 * 60 * 60 * 1000) {
    throw new BadRequestException('Date range cannot exceed 90 days');
  }

  return { scope: parsed.data.scope, from, toExclusive };
}

@Injectable()
export class MonitoringStatisticsService {
  constructor(private readonly prisma: SecurityMonitoringPrismaService) {}

  async getOverview(input: MonitoringStatisticsInput): Promise<MonitoringStatisticsResult> {
    if (input.scope === 'ORGANIZATION' && !isAdmin(input.caller)) {
      throw new ForbiddenException('Administrator role required');
    }

    const dateFilter = { gte: input.from, lt: input.toExclusive };
    if (input.scope === 'ME') {
      return {
        security_alerts: await this.prisma.securityAlert.count({
          where: { actor_id: input.caller.userId, created_at: dateFilter },
        }),
      };
    }

    const openAlerts = await this.prisma.securityAlert.count({
      where: { status: 'OPEN', created_at: dateFilter },
    });
    return { security_alerts: openAlerts, open_alerts: openAlerts };
  }
}
