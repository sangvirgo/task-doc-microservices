import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { TaskDetail } from '@/features/tasks/task-detail';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  children: vi.fn(),
  participants: vi.fn(),
  activity: vi.fn(),
  comments: vi.fn(),
  submissions: vi.fn(),
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
    submissions: mocks.submissions,
  },
}));
vi.mock('@/api/admin', () => ({ adminApi: { directory: mocks.directory } }));
vi.mock('@/api/documents', () => ({ documentsApi: { taskDocuments: mocks.taskDocuments } }));

const parentTask = {
  id: 'parent-task-id',
  title: 'Kế hoạch kiểm toán',
  description: 'Task cha',
  status: 'IN_PROGRESS' as const,
  creator_id: 'creator-id',
  assignee_id: 'employee-id',
  reviewer_id: 'creator-id',
  parent_task_id: null,
  deadline: null,
  blocked: false,
  blocked_reason: null,
  result: null,
  is_overdue: false,
  completion_percentage: 66.67,
  child_task_count: 3,
  approved_child_task_count: 2,
  completion_color: 'YELLOW' as const,
  children: [],
  created_at: '2026-08-08T00:00:00.000Z',
  updated_at: '2026-08-08T00:00:00.000Z',
};

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue(parentTask);
  mocks.children.mockReset().mockResolvedValue([]);
  mocks.participants.mockReset().mockResolvedValue([]);
  mocks.activity.mockReset().mockResolvedValue([]);
  mocks.comments.mockReset().mockResolvedValue([]);
  mocks.submissions.mockReset().mockResolvedValue([]);
  mocks.directory.mockReset().mockResolvedValue([]);
  mocks.taskDocuments.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

it('shows backend task progress on the task detail page', async () => {
  render(<TaskDetail id={parentTask.id} />);

  expect(await screen.findByText('Tiến độ sub-task')).toBeInTheDocument();
  expect(screen.getByText('66.67%')).toBeInTheDocument();
  expect(screen.getByText('2/3 sub-task đã phê duyệt')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '66.67');
});
