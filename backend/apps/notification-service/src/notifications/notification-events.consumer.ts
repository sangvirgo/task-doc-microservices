import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { EventType } from '@c17/contracts';
import { EmailService, deadlineReminderEmail, securityAlertEmail } from '@c17/email';
import { AmqpEventConsumer, queueName } from '@c17/messaging';
import { StructuredLogger } from '@c17/observability';
import type { Prisma } from '@prisma/client-notification';

import { NotificationPrismaService } from '../prisma/notification-prisma.service';
import { UserDirectoryClient } from './user-directory.client';

@Injectable()
export class NotificationEventsConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly consumers: AmqpEventConsumer[];

  constructor(
    private readonly prisma: NotificationPrismaService,
    logger: StructuredLogger,
    private readonly directory: UserDirectoryClient,
    private readonly emailService: EmailService,
  ) {
    this.consumers = [
      new AmqpEventConsumer(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
        logger,
      ),
      new AmqpEventConsumer(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
        logger,
      ),
      new AmqpEventConsumer(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
        logger,
      ),
      new AmqpEventConsumer(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
        logger,
      ),
      new AmqpEventConsumer(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
        logger,
      ),
      new AmqpEventConsumer(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
        logger,
      ),
    ];
  }

  onModuleInit(): void {
    this.consumers[0].subscribe(
      {
        consumer: 'notification-service',
        concern: 'task-created',
        queue: queueName('notification-service', 'task-created'),
        routingKey: EventType.TASK_CREATED,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        const assigneeId =
          typeof event.payload.assignee_id === 'string' ? event.payload.assignee_id : null;
        const reviewerId =
          typeof event.payload.reviewer_id === 'string' ? event.payload.reviewer_id : null;
        const title = typeof event.payload.title === 'string' ? event.payload.title : 'công việc';
        const creatorId = event.actor_id;

        const creator = creatorId ? await this.directory.resolveUser(creatorId) : null;
        const creatorLabel = creator ? creator.email : creatorId ?? 'Hệ thống';

        const recipients: RecipientInput[] = [];

        if (creatorId) {
          recipients.push({
            recipientId: creatorId,
            notificationType: 'TASK_CREATED',
            title: 'Đã tạo công việc',
            body: `Bạn vừa tạo công việc "${title}".`,
            channels: { inApp: true, email: false },
          });
        }

        if (assigneeId && assigneeId !== creatorId) {
          recipients.push({
            recipientId: assigneeId,
            notificationType: 'TASK_ASSIGNED',
            title: 'Được giao công việc',
            body: `${creatorLabel} đã giao công việc "${title}" cho bạn.`,
            channels: { inApp: true, email: false },
          });
        }

        if (reviewerId && reviewerId !== creatorId && reviewerId !== assigneeId) {
          recipients.push({
            recipientId: reviewerId,
            notificationType: 'TASK_ASSIGNED_REVIEW',
            title: 'Được giao duyệt công việc',
            body: `${creatorLabel} giao bạn duyệt công việc "${title}".`,
            channels: { inApp: true, email: false },
          });
        }

        await this.createNotificationsForEvent({
          eventId: event.event_id,
          eventType: event.event_type,
          resourceId: event.resource_id,
          recipients,
          metadata: {
            task_id: event.resource_id,
            correlation_id: event.correlation_id,
          },
        });
      },
    );

    this.consumers[1].subscribe(
      {
        consumer: 'notification-service',
        concern: 'security-alert-created',
        queue: queueName('notification-service', 'security-alert-created'),
        routingKey: EventType.SECURITY_ALERT_CREATED,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        const created = await this.createNotificationsForEvent({
          eventId: event.event_id,
          eventType: event.event_type,
          resourceId: event.resource_id,
          recipients: [
            {
              recipientId: event.actor_id,
              notificationType: 'SECURITY_ALERT',
              title: 'Cảnh báo an toàn',
              body: 'Hoạt động tài khoản của bạn đã phát sinh cảnh báo an toàn.',
              channels: { inApp: true, email: true },
            },
          ],
          metadata: {
            correlation_id: event.correlation_id,
            severity: typeof event.payload.severity === 'string' ? event.payload.severity : null,
            rule_type: typeof event.payload.rule_type === 'string' ? event.payload.rule_type : null,
            alert_id: event.resource_id,
          },
        });

        // HIGH severity alerts page every admin unless the rule disabled alert emails.
        if (created && event.payload.severity === 'HIGH' && event.payload.notify_admins !== false) {
          await this.emailSecurityAlertToAdmins(event);
        }
      },
    );

    this.consumers[2].subscribe(
      {
        consumer: 'notification-service',
        concern: 'grant-expired',
        queue: queueName('notification-service', 'grant-expired'),
        routingKey: EventType.PERMISSION_GRANT_EXPIRED,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        await this.createNotificationsForEvent({
          eventId: event.event_id,
          eventType: event.event_type,
          resourceId: event.resource_id,
          recipients: [
            {
              recipientId: event.actor_id,
              notificationType: 'GRANT_EXPIRED',
              title: 'Quyền truy cập tài liệu đã hết hạn',
              body: 'Một quyền truy cập tài liệu đã hết hạn.',
              channels: { inApp: true, email: true },
            },
          ],
          metadata: {
            correlation_id: event.correlation_id,
            grant_id: typeof event.payload.grant_id === 'string' ? event.payload.grant_id : null,
            effective_expires_at:
              typeof event.payload.effective_expires_at === 'string'
                ? event.payload.effective_expires_at
                : null,
          },
        });
      },
    );

    this.consumers[3].subscribe(
      {
        consumer: 'notification-service',
        concern: 'task-submitted',
        queue: queueName('notification-service', 'task-submitted'),
        routingKey: EventType.TASK_SUBMITTED,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        const authorId =
          typeof event.payload.author_id === 'string' ? event.payload.author_id : null;
        const author = authorId ? await this.directory.resolveUser(authorId) : null;
        const authorLabel = author ? author.email : authorId ?? 'Một thành viên';
        const title =
          typeof event.payload.title === 'string' ? event.payload.title : 'công việc';

        await this.createNotificationsForEvent({
          eventId: event.event_id,
          eventType: event.event_type,
          resourceId: event.resource_id,
          recipients: [
            {
              recipientId:
                typeof event.payload.reviewer_id === 'string' ? event.payload.reviewer_id : null,
              notificationType: 'TASK_SUBMITTED_FOR_REVIEW',
              title: 'Bài nộp công việc cần được duyệt',
              body: `${authorLabel} đã nộp kết quả công việc "${title}", chờ bạn duyệt.`,
              channels: { inApp: true, email: false },
            },
          ],
          metadata: {
            task_id: typeof event.payload.task_id === 'string' ? event.payload.task_id : null,
            submission_id:
              typeof event.payload.submission_id === 'string'
                ? event.payload.submission_id
                : event.resource_id,
            correlation_id: event.correlation_id,
          },
        });
      },
    );

    this.consumers[4].subscribe(
      {
        consumer: 'notification-service',
        concern: 'task-reviewed',
        queue: queueName('notification-service', 'task-reviewed'),
        routingKey: EventType.TASK_REVIEWED,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        const decision =
          typeof event.payload.decision === 'string' ? event.payload.decision : 'REVIEWED';
        const decisionLabel: Record<string, string> = {
          APPROVED: 'đạt yêu cầu',
          REJECTED: 'cần chỉnh sửa',
        };
        const decisionText = decisionLabel[decision] ?? 'đã được đánh giá';
        const reviewer = event.actor_id ? await this.directory.resolveUser(event.actor_id) : null;
        const reviewerLabel = reviewer ? reviewer.email : event.actor_id ?? 'Người đánh giá';
        const title =
          typeof event.payload.title === 'string' ? event.payload.title : 'công việc';

        await this.createNotificationsForEvent({
          eventId: event.event_id,
          eventType: event.event_type,
          resourceId: event.resource_id,
          recipients: [
            {
              recipientId:
                typeof event.payload.author_id === 'string' ? event.payload.author_id : null,
              notificationType: 'TASK_REVIEWED',
              title: 'Kết quả đánh giá công việc',
              body: `${reviewerLabel} đã đánh giá công việc "${title}" của bạn: ${decisionText}.`,
              channels: { inApp: true, email: false },
            },
          ],
          metadata: {
            task_id: typeof event.payload.task_id === 'string' ? event.payload.task_id : null,
            submission_id:
              typeof event.payload.submission_id === 'string'
                ? event.payload.submission_id
                : event.resource_id,
            decision,
            correlation_id: event.correlation_id,
          },
        });
      },
    );

    this.consumers[5].subscribe(
      {
        consumer: 'notification-service',
        concern: 'deadline-reminder',
        queue: queueName('notification-service', 'deadline-reminder'),
        routingKey: EventType.TASK_DEADLINE_REMINDER,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        const taskId =
          typeof event.payload.task_id === 'string' ? event.payload.task_id : event.resource_id;
        const title = typeof event.payload.title === 'string' ? event.payload.title : 'công việc';
        const deadline =
          typeof event.payload.deadline === 'string' ? event.payload.deadline : null;
        const assigneeId =
          typeof event.payload.assignee_id === 'string' ? event.payload.assignee_id : null;

        const created = assigneeId
          ? await this.createNotificationsForEvent({
              eventId: event.event_id,
              eventType: event.event_type,
              resourceId: event.resource_id,
              recipients: [
                {
                  recipientId: assigneeId,
                  notificationType: 'TASK_DEADLINE_REMINDER',
                  title: 'Sắp đến hạn',
                  body:
                    deadline
                      ? `Công việc "${title}" hết hạn lúc ${new Date(deadline).toLocaleString('vi-VN')}.`
                      : `Công việc "${title}" sắp đến hạn.`,
                  channels: { inApp: true, email: false },
                },
              ],
              metadata: {
                task_id: taskId,
                deadline,
                correlation_id: event.correlation_id,
              },
            })
          : false;

        if (created && assigneeId) {
          const recipient = await this.directory.resolveUser(assigneeId);
          if (recipient) {
            const deadlineLabel = deadline
              ? new Date(deadline).toLocaleString('vi-VN')
              : 'thời gian đã định';
            const taskUrl = process.env.WEB_BASE_URL
              ? `${process.env.WEB_BASE_URL}/tasks/${taskId}`
              : undefined;
            const envelope = deadlineReminderEmail(title, deadlineLabel, taskUrl);
            await this.emailService
              .sendMail({ to: recipient.email, ...envelope })
              .catch(() => undefined);
          }
        }
      },
    );
  }

  private async emailSecurityAlertToAdmins(event: {
    resource_id: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const admins = await this.directory.listAdmins();
    if (admins.length === 0) return;

    const severity = typeof event.payload.severity === 'string' ? event.payload.severity : 'HIGH';
    const ruleType =
      typeof event.payload.rule_type === 'string' ? event.payload.rule_type : 'UNKNOWN';
    const alertsUrl = process.env.WEB_BASE_URL
      ? `${process.env.WEB_BASE_URL}/admin/alerts`
      : undefined;

    await Promise.allSettled(
      admins.map((admin) =>
        this.emailService.sendMail({
          to: admin.email,
          ...securityAlertEmail(severity, ruleType, event.resource_id, alertsUrl),
        }),
      ),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.consumers.map((consumer) => consumer.onApplicationShutdown()));
  }

  private async createNotificationsForEvent(input: {
    eventId: string;
    eventType: string;
    resourceId: string;
    recipients: RecipientInput[];
    metadata: Record<string, unknown>;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.consumedEvent.findUnique({
        where: { event_id: input.eventId },
      });
      if (existing) {
        return false;
      }

      const rows: Prisma.NotificationCreateManyInput[] = [];
      for (const recipient of input.recipients) {
        if (!recipient.recipientId) {
          continue;
        }
        const prefs = await tx.notificationPreference.upsert({
          where: { user_id: recipient.recipientId },
          create: {
            user_id: recipient.recipientId,
            email_enabled: true,
            in_app_enabled: true,
          },
          update: {},
        });

        if (recipient.channels.inApp && prefs.in_app_enabled) {
          rows.push({
            recipient_id: recipient.recipientId,
            type: recipient.notificationType,
            title: recipient.title,
            body: recipient.body,
            channel: 'IN_APP',
            metadata: input.metadata as Prisma.InputJsonValue,
          });
        }
        if (recipient.channels.email && prefs.email_enabled) {
          rows.push({
            recipient_id: recipient.recipientId,
            type: recipient.notificationType,
            title: recipient.title,
            body: recipient.body,
            channel: 'EMAIL',
            metadata: input.metadata as Prisma.InputJsonValue,
          });
        }
      }

      if (rows.length > 0) {
        await tx.notification.createMany({ data: rows });
      }

      await tx.consumedEvent.create({
        data: {
          event_id: input.eventId,
          event_type: input.eventType,
          resource_id: input.resourceId,
          metadata: input.metadata as Prisma.InputJsonValue,
        },
      });

      return true;
    });
  }
}

interface RecipientInput {
  recipientId: string | null;
  notificationType: string;
  title: string;
  body: string;
  channels: {
    inApp: boolean;
    email: boolean;
  };
}
