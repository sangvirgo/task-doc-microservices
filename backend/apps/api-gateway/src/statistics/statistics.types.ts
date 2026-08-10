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

export interface TaskStatisticsResponse {
  summary: {
    total_tasks: number;
    in_progress_tasks: number;
    approved_tasks: number;
    overdue_tasks: number;
  };
  task_status: Record<string, number>;
  task_trend: Array<{ date: string; created: number; completed: number }>;
  recent_activity: Array<{
    id: string;
    type: string;
    message: string;
    created_at: string;
  }>;
  organization_tasks?: { total: number; approved: number; overdue: number };
  growth_trend?: Array<{ date: string; tasks: number }>;
}

export interface DocumentStatisticsResponse {
  visible_documents: number;
  task_documents: number;
  eligible_documents?: number;
}

export interface UserStatisticsResponse {
  users: { total: number; active_employees: number; locked_users: number };
  growth_trend: Array<{ date: string; users: number }>;
}

export interface MonitoringStatisticsResponse {
  security_alerts: number;
  open_alerts?: number;
}

export interface AuditVerificationResponse {
  valid: boolean;
}

export interface StatisticsOverviewResponse {
  scope: StatisticsScope;
  range: { from: string; to: string };
  summary: {
    total_tasks: number;
    in_progress_tasks: number;
    approved_tasks: number;
    overdue_tasks: number;
    visible_documents: number;
    task_documents: number;
    security_alerts: number;
  };
  task_status: Record<TaskStatus, number>;
  task_trend: Array<{ date: string; created: number; completed: number }>;
  recent_activity: Array<{
    id: string;
    type: string;
    message: string;
    created_at: string;
  }>;
  users?: UserStatisticsResponse['users'];
  organization_tasks?: { total: number; approved: number; overdue: number };
  security?: { open_alerts: number; audit_chain: 'VALID' | 'INVALID' };
  retention?: { eligible_documents: number };
  growth_trend?: Array<{ date: string; users: number; tasks: number }>;
}

export const taskStatisticsResponseSchema = z.object({
  summary: z.object({
    total_tasks: z.number().int().nonnegative(),
    in_progress_tasks: z.number().int().nonnegative(),
    approved_tasks: z.number().int().nonnegative(),
    overdue_tasks: z.number().int().nonnegative(),
  }),
  task_status: z.record(z.number().int().nonnegative()),
  task_trend: z.array(
    z.object({
      date: z.string(),
      created: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
    }),
  ),
  recent_activity: z.array(
    z.object({ id: z.string(), type: z.string(), message: z.string(), created_at: z.string() }),
  ),
  organization_tasks: z
    .object({
      total: z.number().int().nonnegative(),
      approved: z.number().int().nonnegative(),
      overdue: z.number().int().nonnegative(),
    })
    .optional(),
  growth_trend: z
    .array(z.object({ date: z.string(), tasks: z.number().int().nonnegative() }))
    .optional(),
});

export const documentStatisticsResponseSchema = z.object({
  visible_documents: z.number().int().nonnegative(),
  task_documents: z.number().int().nonnegative(),
  eligible_documents: z.number().int().nonnegative().optional(),
});

export const userStatisticsResponseSchema = z.object({
  users: z.object({
    total: z.number().int().nonnegative(),
    active_employees: z.number().int().nonnegative(),
    locked_users: z.number().int().nonnegative(),
  }),
  growth_trend: z.array(z.object({ date: z.string(), users: z.number().int().nonnegative() })),
});

export const monitoringStatisticsResponseSchema = z.object({
  security_alerts: z.number().int().nonnegative(),
  open_alerts: z.number().int().nonnegative().optional(),
});

export const auditVerificationResponseSchema = z.object({ valid: z.boolean() });

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

    if (!Number.isFinite(fromMs) || new Date(fromMs).toISOString().slice(0, 10) !== value.from) {
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
