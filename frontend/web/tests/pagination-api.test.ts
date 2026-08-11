import { afterEach, expect, it, vi } from 'vitest';
import { tasksApi } from '@/api/tasks';
import { documentsApi } from '@/api/documents';
import { notificationsApi } from '@/api/notifications';
import { clearSession, writeSession } from '@/auth/session';

const token = `header.${btoa(JSON.stringify({ role: 'EMPLOYEE' }))}.signature`;
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
const page = { items: [], pagination: { page: 2, page_size: 20, total: 21, total_pages: 2, has_next: false } };

afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

it('preserves pagination metadata for task collaboration pages', async () => {
  writeSession({ access_token: token, refresh_token: 'refresh', expires_in_seconds: 1800 });
  const fetchMock = vi.fn().mockResolvedValue(json(page));
  vi.stubGlobal('fetch', fetchMock);

  const result = await tasksApi.commentsPage('task-id', 2, 20);

  expect(result).toEqual(page);
  expect(fetchMock.mock.calls[0][0]).toBe('/gateway/tasks/task-id/comments?page=2&page_size=20');
});

it('provides page-aware document and notification methods', async () => {
  writeSession({ access_token: token, refresh_token: 'refresh', expires_in_seconds: 1800 });
  const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(json(url.endsWith('/notifications/notice-id') ? { id: 'notice-id' } : page)));
  vi.stubGlobal('fetch', fetchMock);

  await documentsApi.listPage(1, 100);
  await documentsApi.taskDocumentsPage('task-id', 3, 10);
  await notificationsApi.listPage('user-id', true, 4, 5);
  await notificationsApi.get('notice-id');

  expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
    '/gateway/documents?page=1&page_size=100',
    '/gateway/tasks/task-id/documents?page=3&page_size=10',
    '/gateway/notifications?recipient_id=user-id&unread_only=true&page=4&page_size=5',
    '/gateway/notifications/notice-id',
  ]);
});
