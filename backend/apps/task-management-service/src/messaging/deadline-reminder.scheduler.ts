import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventType, Producer } from '@c17/contracts';
import { randomUUID } from 'crypto';

import { TaskPrismaService } from '../prisma/task-prisma.service';

const TERMINAL_STATUSES = ['APPROVED', 'CANCELLED', 'REJECTED'];
const REMIND_WINDOW_HOURS = 24;
const RE_REMIND_HOURS = 23;

/**
 * Hourly sweep that emits a deadline reminder for tasks that have exactly one day left.
 * Reminders are written through the same outbox used by task mutations, so delivery is
 * exactly-once-ish and survives broker downtime. A task is only reminded again after 23
 * hours so a long-stale deadline does not spam the assignee every hour.
 */
@Injectable()
export class DeadlineReminderScheduler {
  private readonly logger = new Logger(DeadlineReminderScheduler.name);

  constructor(private readonly prisma: TaskPrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sweepDeadlines(): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMIND_WINDOW_HOURS * 60 * 60 * 1000);
    const reRemindCutoff = new Date(now.getTime() - RE_REMIND_HOURS * 60 * 60 * 1000);

    const dueTasks = await this.prisma.task.findMany({
      where: {
        deadline: { gte: now, lte: windowEnd },
        status: { notIn: TERMINAL_STATUSES },
        OR: [{ deadline_reminded_at: null }, { deadline_reminded_at: { lt: reRemindCutoff } }],
      },
      select: {
        id: true,
        title: true,
        deadline: true,
        assignee_id: true,
        creator_id: true,
        deadline_reminded_at: true,
      },
    });

    if (dueTasks.length === 0) return;

    this.logger.log(`deadline reminder sweep found ${dueTasks.length} task(s)`);

    for (const task of dueTasks) {
      const recipientId = task.assignee_id ?? task.creator_id;
      if (!recipientId) continue;

      try {
        await this.prisma.$transaction(async (tx) => {
          const already = await tx.task.findUnique({ where: { id: task.id }, select: { deadline_reminded_at: true } });
          if (already?.deadline_reminded_at && already.deadline_reminded_at >= reRemindCutoff) {
            return;
          }
          await tx.outboxEvent.create({
            data: {
              task_id: task.id,
              event_id: randomUUID(),
              event_type: EventType.TASK_DEADLINE_REMINDER,
              correlation_id: randomUUID(),
              producer: Producer.TASK_MANAGEMENT_SERVICE,
              actor_id: recipientId,
              resource_type: 'TASK',
              resource_id: task.id,
              payload: {
                task_id: task.id,
                title: task.title,
                deadline: task.deadline?.toISOString() ?? null,
                assignee_id: recipientId,
              },
              occurred_at: now,
            },
          });
          await tx.task.update({
            where: { id: task.id },
            data: { deadline_reminded_at: now },
          });
        });
      } catch (error) {
        this.logger.warn(
          `deadline reminder enqueue failed for task ${task.id} — ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
  }
}