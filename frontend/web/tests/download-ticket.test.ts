import { afterEach, expect, it, vi } from 'vitest';
import { documentsApi } from '@/api/documents';
import { clearSession, writeSession } from '@/auth/session';

const safeToken = `header.${btoa(JSON.stringify({ role: 'EMPLOYEE' }))}.signature`;
afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

it('redeems a download ticket once and exposes the actual backend replay denial without retaining bytes', async () => {
  writeSession({ access_token: safeToken, refresh_token: 'refresh', expires_in_seconds: 1800 });
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(new Blob(['safe']), { status: 200, headers: { 'content-type': 'application/octet-stream' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ statusCode: 403 }), { status: 403, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(documentsApi.redeem('document-id', 1, 'ticket-id')).resolves.toBeInstanceOf(Blob);
  await expect(documentsApi.redeem('document-id', 1, 'ticket-id')).rejects.toMatchObject({ status: 403 });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('creates a download ticket with the backend-required task context', async () => {
  writeSession({ access_token: safeToken, refresh_token: 'refresh', expires_in_seconds: 1800 });
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'ticket-id' }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  await documentsApi.ticket('document-id', 1, 'task-id');
  expect(fetchMock.mock.calls[0][0]).toBe('/gateway/documents/document-id/download-ticket');
  expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ task_id: 'task-id', version: 1 });
});
