import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const TASK_STATUSES = [
  'CREATED',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_REVIEW',
  'APPROVED',
  'NEED_REVISION',
  'REJECTED',
  'CANCELLED',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type StatisticsScope = 'ME' | 'ORGANIZATION';

export interface StatisticsQuery {
  scope: StatisticsScope;
  from: string;
  to: string;
}

export interface GatewayUser {
  userId: string;
  email?: string;
  role: string;
  capabilities: string[];
}

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const statisticsQuerySchema = z
  .object({
    scope: z.enum(['ME', 'ORGANIZATION']),
    from: calendarDateSchema,
    to: calendarDateSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const fromMs = Date.parse(`${value.from}T00:00:00.000Z`);
    const toMs = Date.parse(`${value.to}T00:00:00.000Z`);

    if (
      !Number.isFinite(fromMs) ||
      new Date(fromMs).toISOString().slice(0, 10) !== value.from
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'Invalid calendar date',
      });
    }

    if (!Number.isFinite(toMs) || new Date(toMs).toISOString().slice(0, 10) !== value.to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'Invalid calendar date',
      });
    }

    if (Number.isFinite(fromMs) && Number.isFinite(toMs)) {
      if (fromMs > toMs) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['to'],
          message: '`to` must be on or after `from`',
        });
      }

      if (toMs - fromMs > 89 * 24 * 60 * 60 * 1000) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['to'],
          message: 'Date range cannot exceed 90 days',
        });
      }
    }
  });

export function parseStatisticsQuery(query: Record<string, unknown>): StatisticsQuery {
  const parsed = statisticsQuerySchema.safeParse(query);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  return parsed.data;
}

export function toStatisticsDates(query: StatisticsQuery): { from: Date; toExclusive: Date } {
  const from = new Date(`${query.from}T00:00:00.000Z`);
  const toExclusive = new Date(`${query.to}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return { from, toExclusive };
}
