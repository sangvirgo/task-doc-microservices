import { afterEach, expect, it, vi } from 'vitest';
import { tasksApi } from '@/api/tasks';
import { documentsApi } from '@/api/documents';
import { clearSession, writeSession } from '@/auth/session';

const token = `header.${btoa(JSON.stringify({ role: 'EMPLOYEE' }))}.signature`;
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });

afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

it('uses only typed Gateway task mutation paths and canonical lifecycle values', async () => {
  writeSession({ access_token: token, refresh_token: 'refresh', expires_in_seconds: 1800 });
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({ id: 'task-id' }))); vi.stubGlobal('fetch', fetchMock);
  await tasksApi.create({ title: 'Task' }); await tasksApi.assign('task-id', 'employee-id'); await tasksApi.addParticipant('task-id', 'employee-id'); await tasksApi.status('task-id', 'IN_PROGRESS'); await tasksApi.block('task-id', 'Waiting'); await tasksApi.unblock('task-id'); await tasksApi.submit('task-id', 'Result'); await tasksApi.review('submission-id', 'APPROVED');
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/gateway/tasks', '/gateway/tasks/task-id/assign', '/gateway/tasks/task-id/participants', '/gateway/tasks/task-id/status', '/gateway/tasks/task-id/block', '/gateway/tasks/task-id/unblock', '/gateway/tasks/task-id/submit', '/gateway/tasks/submissions/submission-id/review']);
  expect(fetchMock.mock.calls[3][1].body).toBe(JSON.stringify({ status: 'IN_PROGRESS' }));
});

it('uses the preview endpoint without requesting document bytes', async () => {
  writeSession({ access_token: token, refresh_token: 'refresh', expires_in_seconds: 1800 });
  const fetchMock = vi.fn().mockResolvedValue(json({ id: 'document-id', title: 'Metadata' })); vi.stubGlobal('fetch', fetchMock);
  await documentsApi.preview('document-id');
  expect(fetchMock.mock.calls[0][0]).toBe('/gateway/documents/document-id/preview');
});
