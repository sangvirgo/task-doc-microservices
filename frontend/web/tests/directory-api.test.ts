import { afterEach, expect, it, vi } from 'vitest';
import { adminApi } from '@/api/admin';
import { clearSession } from '@/auth/session';

const page = (items: Array<{ id: string; email: string }>, current: number, hasNext: boolean) => new Response(JSON.stringify({ items, pagination: { page: current, page_size: 100, total: 3, total_pages: 2, has_next: hasNext, has_previous: current > 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });

afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

it('loads every directory page so newly registered employees are assignable', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(page([{ id: 'older', email: 'older@example.com' }], 1, true))
    .mockResolvedValueOnce(page([{ id: 'newer', email: 'newer@example.com' }, { id: 'third', email: 'third@example.com' }], 2, false));
  vi.stubGlobal('fetch', fetchMock);

  await expect(adminApi.directory()).resolves.toEqual([
    { id: 'newer', email: 'newer@example.com' },
    { id: 'older', email: 'older@example.com' },
    { id: 'third', email: 'third@example.com' },
  ]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(String(fetchMock.mock.calls[0][0])).toContain('page=1&page_size=100');
  expect(String(fetchMock.mock.calls[1][0])).toContain('page=2&page_size=100');
});