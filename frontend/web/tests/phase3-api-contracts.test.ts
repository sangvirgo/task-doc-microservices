import { afterEach, expect, it, vi } from 'vitest';
import { grantsApi } from '@/api/grants';
import { notificationsApi } from '@/api/notifications';
import { clearSession, writeSession } from '@/auth/session';

const userId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const token = `header.${btoa(JSON.stringify({ role: 'EMPLOYEE', sub: userId }))}.signature`;
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });

afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

it('uses only Gateway grant routes and passes expiry unchanged to the central transport', async () => {
  writeSession({ access_token: token, refresh_token: 'refresh', expires_in_seconds: 1800 });
  const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(json(url.includes('?actor_id=') ? { items: [] } : { id: 'grant-id', status: 'ACTIVE' }))); vi.stubGlobal('fetch', fetchMock);
  await grantsApi.list(userId); await grantsApi.get('grant-id'); await grantsApi.create({ grantor_id: userId, actor_id: otherId, resource_type: 'DOCUMENT', resource_id: otherId, permissions: ['PREVIEW'], task_id: otherId, expires_at: '2026-08-04T12:00:00.000Z' }); await grantsApi.delegate('grant-id', otherId, ['PREVIEW']); await grantsApi.revoke('grant-id', 'Finished');
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual([`/gateway/permissions/grants?actor_id=${userId}`, '/gateway/permissions/grants/grant-id', '/gateway/permissions/grants', '/gateway/permissions/grants/grant-id/delegate', '/gateway/permissions/grants/grant-id']);
  expect(fetchMock.mock.calls[2][1].body).toContain('2026-08-04T12:00:00.000Z');
  expect(fetchMock.mock.calls[4][1].method).toBe('DELETE');
});

it('uses the JWT subject only as a UI-supplied notification filter and preference path', async () => {
  writeSession({ access_token: token, refresh_token: 'refresh', expires_in_seconds: 1800 });
  const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(json(url.includes('?recipient_id=') ? { data: [] } : { count: 1 }))); vi.stubGlobal('fetch', fetchMock);
  await notificationsApi.list(userId, true); await notificationsApi.markRead('notice-id'); await notificationsApi.markAllRead(userId); await notificationsApi.preferences(userId); await notificationsApi.updatePreferences(userId, { email_enabled: false, in_app_enabled: true });
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual([`/gateway/notifications?recipient_id=${userId}&unread_only=true`, '/gateway/notifications/notice-id/read', '/gateway/notifications/read-all', `/gateway/notifications/preferences/${userId}`, `/gateway/notifications/preferences/${userId}`]);
  expect(fetchMock.mock.calls[4][1].method).toBe('PUT');
});
