import { gatewayClient } from './client';
import type { Notification, NotificationPreference } from '@/types/notification';

export const notificationsApi = {
  list: (recipientId: string, unreadOnly = false) => gatewayClient.get<Notification[]>(`/notifications?recipient_id=${encodeURIComponent(recipientId)}${unreadOnly ? '&unread_only=true' : ''}`),
  markRead: (id: string) => gatewayClient.post<Notification>(`/notifications/${encodeURIComponent(id)}/read`),
  markAllRead: (recipientId: string) => gatewayClient.post<{ count: number }>('/notifications/read-all', { recipient_id: recipientId }),
  preferences: (userId: string) => gatewayClient.get<NotificationPreference>(`/notifications/preferences/${encodeURIComponent(userId)}`),
  updatePreferences: (userId: string, data: Pick<NotificationPreference, 'email_enabled' | 'in_app_enabled'>) => gatewayClient.put<NotificationPreference>(`/notifications/preferences/${encodeURIComponent(userId)}`, data),
};
