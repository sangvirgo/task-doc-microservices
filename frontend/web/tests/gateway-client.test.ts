import { afterEach, describe, expect, it, vi } from 'vitest';
import { gatewayClient } from '@/api/client';
import { clearSession, readSession, writeSession } from '@/auth/session';
import { GatewayError } from '@/lib/errors';

const token = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('central Gateway client', () => {
  afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

  it('performs one refresh rotation and retries a 401 request with the new access token', async () => {
    writeSession({ access_token: token('EMPLOYEE'), refresh_token: 'old-refresh', expires_in_seconds: 1800 });
    const refreshed = { access_token: token('EMPLOYEE'), refresh_token: 'new-refresh', expires_in_seconds: 1800 };
    const fetchMock = vi.fn().mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response(refreshed)).mockResolvedValueOnce(response({ ready: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(gatewayClient.get<{ ready: boolean }>('/tasks')).resolves.toEqual({ ready: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new Headers(fetchMock.mock.calls[2][1].headers).get('authorization')).toBe(`Bearer ${refreshed.access_token}`);
    expect(readSession()).toMatchObject({ refresh_token: 'new-refresh' });
  });

  it('does not retry a permission denial', async () => {
    writeSession({ access_token: token('EMPLOYEE'), refresh_token: 'refresh', expires_in_seconds: 1800 });
    const fetchMock = vi.fn().mockResolvedValue(response({ message: 'raw upstream text' }, 403));
    vi.stubGlobal('fetch', fetchMock);
    await expect(gatewayClient.get('/tasks')).rejects.toMatchObject({ status: 403, message: 'You do not have permission to do that.' } satisfies Partial<GatewayError>);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
