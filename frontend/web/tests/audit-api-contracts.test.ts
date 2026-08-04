import { afterEach, expect, it, vi } from 'vitest';
import { auditApi } from '@/api/audit';
import { clearSession, writeSession } from '@/auth/session';

afterEach(() => { clearSession(); vi.unstubAllGlobals(); });
it('uses only ADMIN Gateway audit read and verify routes', async () => {
  writeSession({ access_token: `h.${btoa(JSON.stringify({ role: 'ADMIN' }))}.s`, refresh_token: 'refresh', expires_in_seconds: 1800 });
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } })));
  vi.stubGlobal('fetch', fetchMock); await auditApi.events(); await auditApi.verify();
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/gateway/audit/events?limit=50', '/gateway/audit/chain/verify']);
});
