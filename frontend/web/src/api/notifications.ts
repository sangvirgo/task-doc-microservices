import { gatewayClient } from './client';
import type { Notification, NotificationPreference } from '@/types/notification';
import type { PaginatedResponse } from '@/types/pagination';

const pageQuery = (page: number, pageSize: number) => `page=${page}&page_size=${pageSize}`;

export const notificationsApi = {
  list: (recipientId: string, unreadOnly = false) => gatewayClient.getList<Notification>(`/notifications?recipient_id=${encodeURIComponent(recipientId)}${unreadOnly ? '&unread_only=true' : ''}`),
  listPage: (recipientId: string, unreadOnly = false, page = 1, pageSize = 20): Promise<PaginatedResponse<Notification>> => gatewayClient.getPage<Notification>(`/notifications?recipient_id=${encodeURIComponent(recipientId)}${unreadOnly ? '&unread_only=true' : ''}&${pageQuery(page, pageSize)}`),
  get: (id: string) => gatewayClient.get<Notification>(`/notifications/${encodeURIComponent(id)}`),
  markRead: (id: string) => gatewayClient.post<Notification>(`/notifications/${encodeURIComponent(id)}/read`),
  markAllRead: (recipientId: string) => gatewayClient.post<{ count: number }>('/notifications/read-all', { recipient_id: recipientId }),
  preferences: (userId: string) => gatewayClient.get<NotificationPreference>(`/notifications/preferences/${encodeURIComponent(userId)}`),
  updatePreferences: (userId: string, data: Pick<NotificationPreference, 'email_enabled' | 'in_app_enabled'>) => gatewayClient.put<NotificationPreference>(`/notifications/preferences/${encodeURIComponent(userId)}`, data),
};
