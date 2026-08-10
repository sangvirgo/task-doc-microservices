import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TaskDetail } from '@/features/tasks/task-detail';
import { TaskChildren } from '@/features/tasks/task-children';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  children: vi.fn(),
  participants: vi.fn(),
  activity: vi.fn(),
  comments: vi.fn(),
  directory: vi.fn(),
  taskDocuments: vi.fn(),
}));

vi.mock('@/api/tasks', () => ({
  tasksApi: {
    get: mocks.get,
    children: mocks.children,
    participants: mocks.participants,
    activity: mocks.activity,
    comments: mocks.comments,
  },
}));
vi.mock('@/api/admin', () => ({ adminApi: { directory: mocks.directory } }));
vi.mock('@/api/documents', () => ({ documentsApi: { taskDocuments: mocks.taskDocuments } }));

const task = (overrides: Record<string, unknown> = {}) => ({
  id: 'child-task-id',
  title: 'Kiểm tra phụ lục',
  description: 'Task con',
  status: 'IN_PROGRESS' as const,
  creator_id: 'creator-id',
  assignee_id: 'employee-id',
  reviewer_id: 'creator-id',
  parent_task_id: 'parent-task-id',
  deadline: null,
  blocked: false,
  blocked_reason: null,
  result: null,
  is_overdue: false,
  created_at: '2026-08-08T00:00:00.000Z',
  updated_at: '2026-08-10T00:00:00.000Z',
  ...overrides,
});

const parentTask = task({
  id: 'parent-task-id',
  title: 'Kế hoạch kiểm toán',
  description: 'Task cha',
  parent_task_id: null,
});

const childTask = (id: string, title: string) => task({ id, title, parent_task_id: 'child-task-id' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolver => { resolve = resolver; });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.get.mockReset().mockImplementation(async (id: string) => id === parentTask.id ? parentTask : task());
  mocks.children.mockReset().mockResolvedValue([]);
  mocks.participants.mockReset().mockResolvedValue([]);
  mocks.activity.mockReset().mockResolvedValue([]);
  mocks.comments.mockReset().mockResolvedValue([]);
  mocks.directory.mockReset().mockResolvedValue([]);
  mocks.taskDocuments.mockReset().mockResolvedValue([]);
  window.sessionStorage.setItem('c17.web.session.v1', JSON.stringify({
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in_seconds: 3600,
    role: 'EMPLOYEE',
    userId: 'employee-id',
    expiresAt: Date.now() + 3600000,
  }));
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

it('shows the parent task title as a link while keeping the child as the main heading', async () => {
  render(<TaskDetail id="child-task-id" />);

  expect(await screen.findByRole('heading', { name: 'Kiểm tra phụ lục' })).toBeInTheDocument();
  const parentLink = await screen.findByRole('link', { name: 'Kế hoạch kiểm toán' });
  expect(parentLink).toHaveAttribute('href', '/tasks/parent-task-id');
});

it('renders direct children as task links without loading child documents', async () => {
  const directChild = childTask('direct-child-id', 'Phần việc trực tiếp');
  mocks.children.mockResolvedValue([directChild]);

  render(<TaskChildren parentId="child-task-id" />);

  const childLink = await screen.findByRole('link', { name: /Phần việc trực tiếp/ });
  expect(childLink).toHaveAttribute('href', '/tasks/direct-child-id');
  await waitFor(() => expect(mocks.children).toHaveBeenCalledWith('child-task-id'));
  expect(mocks.taskDocuments).not.toHaveBeenCalledWith('direct-child-id');
});

it('ignores a stale task response after navigating to another task', async () => {
  const first = deferred<ReturnType<typeof task>>();
  const second = deferred<ReturnType<typeof task>>();
  mocks.get.mockReset().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

  const { rerender } = render(<TaskDetail id="task-a" />);
  rerender(<TaskDetail id="task-b" />);
  second.resolve(task({ id: 'task-b', title: 'Task B', parent_task_id: null }));

  expect(await screen.findByRole('heading', { name: 'Task B' })).toBeInTheDocument();
  first.resolve(task({ id: 'task-a', title: 'Task A', parent_task_id: null }));
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Task A' })).not.toBeInTheDocument());
});

it('shows a retryable error when direct child loading fails', async () => {
  const directChild = childTask('direct-child-id', 'Phần việc trực tiếp');
  mocks.children.mockReset().mockRejectedValueOnce(new Error('gateway failed')).mockResolvedValueOnce([directChild]);

  render(<TaskChildren parentId="child-task-id" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được sub-task');
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByRole('link', { name: /Phần việc trực tiếp/ })).toHaveAttribute('href', '/tasks/direct-child-id');
});
