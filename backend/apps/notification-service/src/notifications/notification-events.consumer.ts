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
        await this.createNotificationsForEvent({
          eventId: event.event_id,
          eventType: event.event_type,
          resourceId: event.resource_id,
          recipientId:
            typeof event.payload.assignee_id === 'string' ? event.payload.assignee_id : null,
          channels: {
            inApp: true,
            email: false,
          },
          notificationType: 'TASK_ASSIGNED',
          title: 'Task assigned',
          body:
            typeof event.payload.title === 'string'
              ? `You were assigned task "${event.payload.title}".`
              : 'You were assigned a task.',
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
        concern: 'session-revoked',
        queue: queueName('notification-service', 'session-revoked'),
        routingKey: EventType.AUTH_SESSION_REVOKED,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        await this.createNotificationsForEvent({
          eventId: event.event_id,
          eventType: event.event_type,
          resourceId: event.resource_id,
          recipientId: event.actor_id,
          channels: {
            inApp: true,
            email: true,
          },
          notificationType: 'SECURITY_SESSION_REVOKED',
          title: 'Session revoked',
          body:
            event.payload.reason_code === 'SECURITY_LOCK'
              ? 'Your active sessions were revoked due to a security lock.'
              : 'Your session was revoked.',
          metadata: {
            correlation_id: event.correlation_id,
            reason_code:
              typeof event.payload.reason_code === 'string' ? event.payload.reason_code : null,
          },
        });
      },
    );

    this.consumers[2].subscribe(
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
          recipientId: event.actor_id,
          channels: {
            inApp: true,
            email: true,
          },
          notificationType: 'SECURITY_ALERT',
          title: 'Security alert',
          body: 'A security alert was raised on your account activity.',
          metadata: {
            correlation_id: event.correlation_id,
            severity: typeof event.payload.severity === 'string' ? event.payload.severity : null,
            rule_type: typeof event.payload.rule_type === 'string' ? event.payload.rule_type : null,
            alert_id: event.resource_id,
          },
        });

        // HIGH severity alerts (e.g. repeated failed logins, brute force) also page every admin.
        if (created && event.payload.severity === 'HIGH') {
          await this.emailSecurityAlertToAdmins(event);
        }
      },
    );

    this.consumers[3].subscribe(
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
          recipientId: event.actor_id,
          channels: {
            inApp: true,
            email: true,
          },
          notificationType: 'GRANT_EXPIRED',
          title: 'Document access expired',
          body: 'A document access grant has expired.',
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

    this.consumers[4].subscribe(
      {
        consumer: 'notification-service',
        concern: 'task-submitted',
        queue: queueName('notification-service', 'task-submitted'),
        routingKey: EventType.TASK_SUBMITTED,
        retryDelayMs: 1_000,
        maxAttempts: 3,
      },
      async (event) => {
        await this.createNotificationsForEvent({
          eventId: event.event_id,
          eventType: event.event_type,
          resourceId: event.resource_id,
          recipientId:
            typeof event.payload.reviewer_id === 'string' ? event.payload.reviewer_id : null,
          channels: { inApp: true, email: false },
          notificationType: 'TASK_SUBMITTED_FOR_REVIEW',
          title: 'Task submission needs review',
          body:
            typeof event.payload.title === 'string'
              ? `A submission for task "${event.payload.title}" is ready for your review.`
              : 'A task submission is ready for your review.',
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

    this.consumers[5].subscribe(
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
        await this.createNotificationsForEvent({
          eventId: event.event_id,
          eventType: event.event_type,
          resourceId: event.resource_id,
          recipientId: typeof event.payload.author_id === 'string' ? event.payload.author_id : null,
          channels: { inApp: true, email: false },
          notificationType: 'TASK_REVIEWED',
          title: `Task submission ${decision.toLowerCase().replace('_', ' ')}`,
          body:
            typeof event.payload.title === 'string'
              ? `Your submission for task "${event.payload.title}" was ${decision.toLowerCase().replace('_', ' ')}.`
              : `Your task submission was ${decision.toLowerCase().replace('_', ' ')}.`,
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

    this.consumers[6].subscribe(
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
        const title = typeof event.payload.title === 'string' ? event.payload.title : 'Task';
        const deadline =
          typeof event.payload.deadline === 'string' ? event.payload.deadline : null;
        const assigneeId =
          typeof event.payload.assignee_id === 'string' ? event.payload.assignee_id : null;

        const created = assigneeId
          ? await this.createNotificationsForEvent({
              eventId: event.event_id,
              eventType: event.event_type,
              resourceId: event.resource_id,
              recipientId: assigneeId,
              channels: { inApp: true, email: false },
              notificationType: 'TASK_DEADLINE_REMINDER',
              title: 'Sắp đến hạn',
              body:
                deadline
                  ? `Task "${title}" hết hạn lúc ${new Date(deadline).toLocaleString('vi-VN')}.`
                  : `Task "${title}" sắp đến hạn.`,
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
    recipientId: string | null;
    channels: {
      inApp: boolean;
      email: boolean;
    };
    notificationType: string;
    title: string;
    body: string;
    metadata: Record<string, unknown>;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.consumedEvent.findUnique({
        where: { event_id: input.eventId },
      });
      if (existing) {
        return false;
      }

      if (input.recipientId) {
        const prefs = await tx.notificationPreference.upsert({
          where: { user_id: input.recipientId },
          create: { user_id: input.recipientId, email_enabled: true, in_app_enabled: true },
          update: {},
        });

        const rows: Prisma.NotificationCreateManyInput[] = [];
        if (input.channels.inApp && prefs.in_app_enabled) {
          rows.push({
            recipient_id: input.recipientId,
            type: input.notificationType,
            title: input.title,
            body: input.body,
            channel: 'IN_APP',
            metadata: input.metadata as Prisma.InputJsonValue,
          });
        }
        if (input.channels.email && prefs.email_enabled) {
          rows.push({
            recipient_id: input.recipientId,
            type: input.notificationType,
            title: input.title,
            body: input.body,
            channel: 'EMAIL',
            metadata: input.metadata as Prisma.InputJsonValue,
          });
        }

        if (rows.length > 0) {
          await tx.notification.createMany({ data: rows });
        }
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
