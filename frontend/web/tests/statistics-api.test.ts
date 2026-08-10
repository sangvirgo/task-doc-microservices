import { afterEach, expect, it, vi } from 'vitest';
import { statisticsApi } from '@/api/statistics';
import { clearSession, writeSession } from '@/auth/session';

const token = `header.${btoa(JSON.stringify({ role: 'EMPLOYEE' })).replace(/=/g, '')}.signature`;
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });

afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

it('uses the public gateway statistics path without duplicating the gateway api prefix', async () => {
  writeSession({ access_token: token, refresh_token: 'refresh', expires_in_seconds: 1800 });
  const fetchMock = vi.fn().mockResolvedValue(json({ scope: 'ME' }));
  vi.stubGlobal('fetch', fetchMock);

  await statisticsApi.overview('ME', '2026-08-01', '2026-08-10');

  expect(fetchMock.mock.calls[0][0]).toBe('/gateway/statistics/overview?scope=ME&from=2026-08-01&to=2026-08-10');
});
