import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthContext } from '@c17/auth-context';
import type { Prisma } from '@prisma/client-task';
import { z } from 'zod';

import { TaskPrismaService } from '../prisma/task-prisma.service';

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

const TERMINAL_STATUSES = new Set<TaskStatus>(['APPROVED', 'REJECTED', 'CANCELLED']);

export interface TaskStatisticsResult {
  summary: {
    total_tasks: number;
    in_progress_tasks: number;
    approved_tasks: number;
    overdue_tasks: number;
  };
  task_status: Record<TaskStatus, number>;
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

export interface TaskStatisticsInput {
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

export function parseTaskStatisticsQuery(query: Record<string, unknown>): {
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
export class TaskStatisticsService {
  constructor(private readonly prisma: TaskPrismaService) {}

  async getOverview(input: TaskStatisticsInput): Promise<TaskStatisticsResult> {
    if (input.scope === 'ORGANIZATION' && input.caller.role !== 'ADMIN') {
      throw new ForbiddenException('Administrator role required');
    }

    const visibilityWhere: Prisma.TaskWhereInput =
      input.scope === 'ME'
        ? { participants: { some: { user_id: input.caller.userId } } }
        : {};

    const [visibleTasks, tasksInRange] = await Promise.all([
      this.prisma.task.findMany({
        where: visibilityWhere,
        select: { id: true },
      }),
      this.prisma.task.findMany({
        where: {
          ...visibilityWhere,
          created_at: { gte: input.from, lt: input.toExclusive },
        },
        select: { id: true, status: true, deadline: true, created_at: true },
      }),
    ]);

    const visibleTaskIds = visibleTasks.map((task) => task.id);
    const [completedHistory, activities] = await Promise.all([
      this.prisma.taskStatusHistory.findMany({
        where: {
          task_id: { in: visibleTaskIds },
          to_status: 'APPROVED',
          created_at: { gte: input.from, lt: input.toExclusive },
        },
        select: { created_at: true },
      }),
      this.prisma.taskActivity.findMany({
        where: {
          task_id: { in: visibleTaskIds },
          created_at: { gte: input.from, lt: input.toExclusive },
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: 10,
        select: { id: true, activity_type: true, summary: true, created_at: true },
      }),
    ]);

    const taskStatus = Object.fromEntries(
      TASK_STATUSES.map((status) => [status, 0]),
    ) as Record<TaskStatus, number>;
    let overdueTasks = 0;
    for (const task of tasksInRange) {
      if (TASK_STATUSES.includes(task.status as TaskStatus)) {
        taskStatus[task.status as TaskStatus] += 1;
      }
      if (
        task.deadline &&
        task.deadline.getTime() < Date.now() &&
        !TERMINAL_STATUSES.has(task.status as TaskStatus)
      ) {
        overdueTasks += 1;
      }
    }

    const trend = new Map<string, { created: number; completed: number }>();
    for (
      let cursor = new Date(input.from);
      cursor < input.toExclusive;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      trend.set(cursor.toISOString().slice(0, 10), { created: 0, completed: 0 });
    }
    for (const task of tasksInRange) {
      const bucket = trend.get(task.created_at.toISOString().slice(0, 10));
      if (bucket) bucket.created += 1;
    }
    for (const history of completedHistory) {
      const bucket = trend.get(history.created_at.toISOString().slice(0, 10));
      if (bucket) bucket.completed += 1;
    }

    const taskTrend = Array.from(trend, ([date, counts]) => ({ date, ...counts }));
    const result: TaskStatisticsResult = {
      summary: {
        total_tasks: tasksInRange.length,
        in_progress_tasks: taskStatus.IN_PROGRESS,
        approved_tasks: taskStatus.APPROVED,
        overdue_tasks: overdueTasks,
      },
      task_status: taskStatus,
      task_trend: taskTrend,
      recent_activity: activities.map((activity) => ({
        id: activity.id,
        type: activity.activity_type,
        message: activity.summary,
        created_at: activity.created_at.toISOString(),
      })),
    };

    if (input.scope === 'ORGANIZATION') {
      const organizationTasks = await this.prisma.task.findMany({
        where: { created_at: { lt: input.toExclusive } },
        select: { status: true, deadline: true, created_at: true },
      });
      const growthTrend = new Map<string, number>();
      for (
        let cursor = new Date(input.from);
        cursor < input.toExclusive;
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      ) {
        const endOfDay = new Date(cursor);
        endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
        growthTrend.set(
          cursor.toISOString().slice(0, 10),
          organizationTasks.filter((task) => task.created_at < endOfDay).length,
        );
      }
      result.organization_tasks = {
        total: organizationTasks.length,
        approved: organizationTasks.filter((task) => task.status === 'APPROVED').length,
        overdue: organizationTasks.filter(
          (task) =>
            task.deadline &&
            task.deadline.getTime() < Date.now() &&
            !TERMINAL_STATUSES.has(task.status as TaskStatus),
        ).length,
      };
      result.growth_trend = Array.from(growthTrend, ([date, tasks]) => ({ date, tasks }));
    }

    return result;
  }
}
