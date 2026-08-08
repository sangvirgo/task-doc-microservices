import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client-notification';
import {
  createPaginationMeta,
  PaginatedResponse,
  PaginationQuery,
  toPrismaPagination,
} from '@c17/contracts';

import { NotificationPrismaService } from '../prisma/notification-prisma.service';

export interface NotificationDto {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string;
  channel: string;
  read_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface NotificationPreferenceDto {
  id: string;
  user_id: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
}

const DEFAULT_PAGINATION: PaginationQuery = { page: 1, page_size: 20 };

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: NotificationPrismaService) {}

  async createNotification(data: {
    recipient_id: string;
    type: string;
    title: string;
    body: string;
    channel?: string;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationDto> {
    const notification = await this.prisma.notification.create({
      data: {
        recipient_id: data.recipient_id,
        type: data.type,
        title: data.title,
        body: data.body,
        channel: data.channel || 'IN_APP',
        metadata:
          data.metadata === undefined ? undefined : (data.metadata as Prisma.InputJsonValue),
      },
    });
    return this.toDto(notification);
  }

  async getNotification(id: string): Promise<NotificationDto> {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException('Notification not found');
    return this.toDto(notification);
  }

  async listNotifications(
    recipient_id: string,
    unread_only?: boolean,
    pagination: PaginationQuery = DEFAULT_PAGINATION,
  ): Promise<PaginatedResponse<NotificationDto>> {
    const where = {
      recipient_id,
      ...(unread_only ? { read_at: null } : {}),
    };
    const [total, notifications] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        ...toPrismaPagination(pagination),
      }),
    ]);
    return {
      items: notifications.map((n) => this.toDto(n)),
      pagination: createPaginationMeta(pagination.page, pagination.page_size, total),
    };
  }

  async markAsRead(id: string): Promise<NotificationDto> {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException('Notification not found');

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { read_at: new Date() },
    });
    return this.toDto(updated);
  }

  async markAllAsRead(recipient_id: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { recipient_id, read_at: null },
      data: { read_at: new Date() },
    });
    return { count: result.count };
  }

  async getPreferences(user_id: string): Promise<NotificationPreferenceDto> {
    const prefs = await this.prisma.notificationPreference.upsert({
      where: { user_id },
      create: { user_id, email_enabled: true, in_app_enabled: true },
      update: {},
    });
    return {
      id: prefs.id,
      user_id: prefs.user_id,
      email_enabled: prefs.email_enabled,
      in_app_enabled: prefs.in_app_enabled,
    };
  }

  async updatePreferences(
    user_id: string,
    data: { email_enabled?: boolean; in_app_enabled?: boolean },
  ): Promise<NotificationPreferenceDto> {
    const prefs = await this.prisma.notificationPreference.upsert({
      where: { user_id },
      create: {
        user_id,
        email_enabled: data.email_enabled ?? true,
        in_app_enabled: data.in_app_enabled ?? true,
      },
      update: {
        ...(data.email_enabled !== undefined ? { email_enabled: data.email_enabled } : {}),
        ...(data.in_app_enabled !== undefined ? { in_app_enabled: data.in_app_enabled } : {}),
      },
    });
    return {
      id: prefs.id,
      user_id: prefs.user_id,
      email_enabled: prefs.email_enabled,
      in_app_enabled: prefs.in_app_enabled,
    };
  }

  private toDto(notification: {
    id: string;
    recipient_id: string;
    type: string;
    title: string;
    body: string;
    channel: string;
    read_at: Date | null;
    metadata: unknown;
    created_at: Date;
  }): NotificationDto {
    return {
      id: notification.id,
      recipient_id: notification.recipient_id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      channel: notification.channel,
      read_at: notification.read_at?.toISOString() ?? null,
      metadata: notification.metadata as Record<string, unknown> | null,
      created_at: notification.created_at.toISOString(),
    };
  }
}
