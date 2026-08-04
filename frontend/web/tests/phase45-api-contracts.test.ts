import { afterEach, expect, it, vi } from 'vitest';
import { adminApi } from '@/api/admin';
import { recordsApi } from '@/api/records';
import { clearSession, writeSession } from '@/auth/session';

const token = `header.${btoa(JSON.stringify({ role: 'ADMIN', sub: '11111111-1111-4111-8111-111111111111' }))}.signature`;
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

it('uses Gateway-only administration routes and excludes monitoring event writes', async () => {
  writeSession({ access_token: token, refresh_token: 'refresh', expires_in_seconds: 1800 }); const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json([]))); vi.stubGlobal('fetch', fetchMock);
  await adminApi.users(); await adminApi.lock('user-id'); await adminApi.grantCapability('user-id', 'ARCHIVE_RECEIVE'); await adminApi.alerts(); await adminApi.rules(); await adminApi.toggleRule('rule-id', false);
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/gateway/users', '/gateway/users/user-id/lock', '/gateway/users/user-id/capabilities', '/gateway/monitoring/alerts', '/gateway/monitoring/rules', '/gateway/monitoring/rules/rule-id/toggle']);
  expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/events'))).toBe(false);
});

it('uses Gateway-only records and transfer-package custody routes', async () => {
  writeSession({ access_token: token, refresh_token: 'refresh', expires_in_seconds: 1800 }); const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({ id: 'x' }))); vi.stubGlobal('fetch', fetchMock);
  await recordsApi.list(); await recordsApi.create('Record'); await recordsApi.addEntry('record-id', 'document-id', 'version-id'); await recordsApi.seal('record-id'); await recordsApi.packages(); await recordsApi.createPackage('record-id'); await recordsApi.reject('package-id', 'Incomplete');
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/gateway/records', '/gateway/records', '/gateway/records/record-id/entries', '/gateway/records/record-id/seal', '/gateway/transfer-packages', '/gateway/transfer-packages', '/gateway/transfer-packages/package-id/reject']);
});
