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
  it('uses the same-origin Gateway rewrite even when a backend URL is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3000');
    const fetchMock = vi.fn().mockResolvedValue(response({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(gatewayClient.get('/tasks')).resolves.toEqual({ items: [] });
    expect(fetchMock.mock.calls[0][0]).toBe('/gateway/tasks');
  });

  it('normalizes array and common Gateway list envelopes before UI rendering', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([{ id: 'direct' }]))
      .mockResolvedValueOnce(response({ items: [{ id: 'items' }] }))
      .mockResolvedValueOnce(response({ data: [{ id: 'data' }] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(gatewayClient.getList<{ id: string }>('/direct')).resolves.toEqual([{ id: 'direct' }]);
    await expect(gatewayClient.getList<{ id: string }>('/items')).resolves.toEqual([{ id: 'items' }]);
    await expect(gatewayClient.getList<{ id: string }>('/data')).resolves.toEqual([{ id: 'data' }]);
  });

  it('turns a malformed list response into a handled Gateway error instead of a render crash', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ message: 'not a list' })));
    await expect(gatewayClient.getList('/users/directory')).rejects.toMatchObject({ status: 502 });
  });
  it('sends JSON Content-Type when redeeming a ticket and preserves the blob MIME type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(['pdf'], { type: 'application/pdf' }), { status: 200, headers: { 'content-type': 'application/pdf' } }));
    vi.stubGlobal('fetch', fetchMock);
    const blob = await gatewayClient.postBlob('/documents/doc-id/versions/1/redeem', { ticket_id: 'ticket-id' });
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(blob.type).toBe('application/pdf');
  });
  it('sends the task context required by secure document download tickets', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ id: 'ticket-id' }));
    vi.stubGlobal('fetch', fetchMock);
    await gatewayClient.post('/documents/doc-id/download-ticket', { task_id: 'task-id', version: 1 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ task_id: 'task-id', version: 1 });
  });
});
