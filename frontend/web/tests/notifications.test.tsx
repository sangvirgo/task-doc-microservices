import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { writeSession, clearSession } from '@/auth/session';
import { NotificationList } from '@/features/notifications/notification-list';
import { NotificationDetail } from '@/features/notifications/notification-detail';

const mocks = vi.hoisted(() => ({ list: vi.fn(), listPage: vi.fn(), get: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), preferences: vi.fn(), updatePreferences: vi.fn() }));

vi.mock('@/api/notifications', () => ({ notificationsApi: mocks }));

const notification = { id: 'notice-id', recipient_id: 'user-id', type: 'TASK_ASSIGNED', title: 'Bạn được giao một task', body: 'Kế hoạch kiểm toán cần bạn xử lý.', channel: 'IN_APP', read_at: null, metadata: { task_id: 'task-id', task_title: 'Kế hoạch kiểm toán' }, created_at: '2026-08-11T08:00:00.000Z' };
const preference = { id: 'preference-id', user_id: 'user-id', email_enabled: true, in_app_enabled: true };

beforeEach(() => {
  mocks.list.mockReset().mockResolvedValue([notification]);
  mocks.listPage.mockReset();
  mocks.get.mockReset().mockResolvedValue(notification);
  mocks.markRead.mockReset().mockResolvedValue({ ...notification, read_at: '2026-08-11T08:01:00.000Z' });
  mocks.markAllRead.mockReset().mockResolvedValue({ count: 1 });
  mocks.preferences.mockReset().mockResolvedValue(preference);
  mocks.updatePreferences.mockReset().mockResolvedValue(preference);
  writeSession({ access_token: `header.${btoa(JSON.stringify({ role: 'EMPLOYEE', sub: 'user-id' }))}.signature`, refresh_token: 'refresh', expires_in_seconds: 3600 });
});

afterEach(() => { cleanup(); clearSession(); });

it('links each notification to its detail page', async () => {
  render(<NotificationList />);
  expect(await screen.findByRole('link', { name: /Bạn được giao một task/ })).toHaveAttribute('href', '/notifications/notice-id');
});

it('shows notification metadata and marks an unread notification read on detail', async () => {
  render(<NotificationDetail id="notice-id" />);
  expect(await screen.findByRole('heading', { name: 'Bạn được giao một task' })).toBeInTheDocument();
  expect(screen.getByText('Kế hoạch kiểm toán')).toBeVisible();
  expect(screen.getByRole('link', { name: /mở task/i })).toHaveAttribute('href', '/tasks/task-id');
  expect(mocks.markRead).toHaveBeenCalledWith('notice-id');
});
