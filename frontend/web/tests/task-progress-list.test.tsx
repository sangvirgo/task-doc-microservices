import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { TaskList } from '@/features/tasks/task-list';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  directory: vi.fn(),
}));

vi.mock('@/api/tasks', () => ({ tasksApi: { list: mocks.list, create: mocks.create } }));
vi.mock('@/api/admin', () => ({ adminApi: { directory: mocks.directory } }));

const task = {
  id: 'parent-task-id',
  title: 'Kế hoạch kiểm toán',
  description: 'Theo dõi tiến độ task cha',
  status: 'IN_PROGRESS' as const,
  creator_id: 'creator-id',
  assignee_id: null,
  reviewer_id: null,
  parent_task_id: null,
  deadline: null,
  blocked: false,
  blocked_reason: null,
  result: null,
  is_overdue: false,
  completion_percentage: 75,
  child_task_count: 4,
  approved_child_task_count: 3,
  completion_color: 'GREEN' as const,
  children: [],
  created_at: '2026-08-08T00:00:00.000Z',
  updated_at: '2026-08-08T00:00:00.000Z',
};

beforeEach(() => {
  mocks.list.mockReset().mockResolvedValue([task]);
  mocks.create.mockReset();
  mocks.directory.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

it('shows the approved child-task ratio in both list and Kanban views', async () => {
  render(<TaskList />);

  expect(await screen.findByText('3/4')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /kế hoạch kiểm toán/i })).toHaveAttribute('href', '/tasks/parent-task-id');

  fireEvent.click(screen.getByRole('tab', { name: /bảng/i }));

  expect(screen.getByText('3/4')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /kế hoạch kiểm toán/i })).toHaveAttribute('href', '/tasks/parent-task-id');
});
