import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { isAdmin, type AuthContext } from '@c17/auth-context';
import { z } from 'zod';

import { UserRolePrismaService } from '../prisma/user-role-prisma.service';

export interface UserStatisticsResult {
  users: {
    total: number;
    active_employees: number;
    locked_users: number;
  };
  growth_trend: Array<{ date: string; users: number }>;
}

export interface UserStatisticsInput {
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

export function parseUserStatisticsQuery(query: Record<string, unknown>): {
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
export class UserStatisticsService {
  constructor(private readonly prisma: UserRolePrismaService) {}

  async getOverview(input: UserStatisticsInput): Promise<UserStatisticsResult> {
    if (input.scope !== 'ORGANIZATION' || !isAdmin(input.caller)) {
      throw new ForbiddenException('Administrator role required');
    }

    const users = await this.prisma.user.findMany({
      select: { role: true, locked_at: true, created_at: true },
    });
    const trend = new Map<string, number>();
    for (
      let cursor = new Date(input.from);
      cursor < input.toExclusive;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const date = cursor.toISOString().slice(0, 10);
      const endOfDay = new Date(cursor);
      endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
      trend.set(date, users.filter((user) => user.created_at < endOfDay).length);
    }

    return {
      users: {
        total: users.length,
        active_employees: users.filter((user) => user.role === 'EMPLOYEE' && !user.locked_at)
          .length,
        locked_users: users.filter((user) => user.locked_at !== null).length,
      },
      growth_trend: Array.from(trend, ([date, count]) => ({ date, users: count })),
    };
  }
}
