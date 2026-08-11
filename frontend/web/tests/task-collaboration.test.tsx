import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TaskCollaboration } from '@/features/tasks/task-collaboration';

const mocks = vi.hoisted(() => ({ commentsPage: vi.fn(), activityPage: vi.fn(), comment: vi.fn() }));

vi.mock('@/api/tasks', () => ({ tasksApi: mocks }));

const members = [
  { id: 'user-1', email: 'user@example.com' },
];
const page = <T,>(items: T[], hasNext: boolean) => ({ items, pagination: { page: hasNext ? 1 : 2, page_size: 1, total: hasNext ? 2 : 2, total_pages: 2, has_next: hasNext } });
const comment = (id: string, content: string) => ({ id, task_id: 'task-id', author_id: 'user-1', content, created_at: '2026-08-10T00:00:00.000Z' });
const activity = (id: string, summary: string) => ({ id, activity_type: 'TASK_UPDATED', actor_id: 'user-1', summary, created_at: '2026-08-10T00:00:00.000Z' });

let observerCallbacks: Array<(entries: IntersectionObserverEntry[]) => void> = [];
class FakeIntersectionObserver {
  constructor(callback: (entries: IntersectionObserverEntry[]) => void) { observerCallbacks.push(callback); }
  observe() { return undefined; }
  disconnect() { return undefined; }
  unobserve() { return undefined; }
}

beforeEach(() => {
  observerCallbacks = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  mocks.commentsPage.mockReset().mockResolvedValue(page([comment('c1', 'Đầu tiên')], true));
  mocks.activityPage.mockReset().mockResolvedValue(page([activity('a1', 'Task updated')], false));
  mocks.comment.mockReset().mockResolvedValue({ id: 'c-new', created_at: '2026-08-10T00:00:00.000Z' });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('opens comments first and appends the next page at the scroll sentinel', async () => {
  mocks.commentsPage.mockResolvedValueOnce(page([comment('c1', 'Đầu tiên')], true)).mockResolvedValueOnce(page([comment('c2', 'Tiếp theo')], false));
  render(<TaskCollaboration taskId="task-id" members={members} />);

  expect(await screen.findByText('Đầu tiên')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Bình luận/ })).toHaveAttribute('aria-selected', 'true');
  observerCallbacks.at(-1)?.([{ isIntersecting: true } as IntersectionObserverEntry]);
  expect(await screen.findByText('Tiếp theo')).toBeInTheDocument();
  expect(mocks.commentsPage).toHaveBeenLastCalledWith('task-id', 2, 20);
});

it('keeps the comment composer inside the active conversation surface', async () => {
  render(<TaskCollaboration taskId="task-id" members={members} />);

  const thread = await screen.findByRole('region', { name: 'Bình luận' });
  expect(within(thread).getByRole('textbox', { name: 'Nội dung' })).toBeInTheDocument();
});

it('switches to the timeline tab and loads activity independently', async () => {
  render(<TaskCollaboration taskId="task-id" members={members} />);

  fireEvent.click(screen.getByRole('tab', { name: /Dòng thời gian/ }));

  expect(await screen.findByText('Task updated')).toBeInTheDocument();
  expect(mocks.activityPage).toHaveBeenCalledWith('task-id', 1, 20);
  expect(screen.getByRole('tab', { name: /Bình luận/ })).toHaveAttribute('aria-selected', 'false');
});

it('keeps loaded comments and exposes retry when a later page fails', async () => {
  mocks.commentsPage.mockResolvedValueOnce(page([comment('c1', 'Đầu tiên')], true)).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page([comment('c2', 'Sau khi thử lại')], false));
  render(<TaskCollaboration taskId="task-id" members={members} />);
  await screen.findByText('Đầu tiên');
  observerCallbacks.at(-1)?.([{ isIntersecting: true } as IntersectionObserverEntry]);

  expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  expect(screen.getByText('Đầu tiên')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  await waitFor(() => expect(screen.getByText('Sau khi thử lại')).toBeInTheDocument());
});
