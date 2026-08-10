import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TaskDetail } from '@/features/tasks/task-detail';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), participants: vi.fn(), activity: vi.fn(), comments: vi.fn(), create: vi.fn(), directory: vi.fn(), taskDocuments: vi.fn(),
}));

vi.mock('@/api/tasks', () => ({ tasksApi: { get: mocks.get, participants: mocks.participants, activity: mocks.activity, comments: mocks.comments, create: mocks.create } }));
vi.mock('@/api/admin', () => ({ adminApi: { directory: mocks.directory } }));
vi.mock('@/api/documents', () => ({ documentsApi: { taskDocuments: mocks.taskDocuments } }));

const parentTask = {
  id: 'parent-task-id', title: 'Kế hoạch kiểm toán', description: 'Task cha', status: 'CREATED' as const,
  creator_id: 'creator-id', assignee_id: 'employee-id', reviewer_id: 'creator-id', parent_task_id: null, deadline: null, blocked: false,
  blocked_reason: null, result: null, is_overdue: false, created_at: '2026-08-08T00:00:00.000Z', updated_at: '2026-08-08T00:00:00.000Z',
};

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue(parentTask);
  mocks.participants.mockReset().mockResolvedValue([]);
  mocks.activity.mockReset().mockResolvedValue([]);
  mocks.comments.mockReset().mockResolvedValue([]);
  mocks.create.mockReset().mockResolvedValue({ ...parentTask, id: 'child-task-id', title: 'Kiểm tra phụ lục', assignee_id: 'creator-id', reviewer_id: 'employee-id', parent_task_id: parentTask.id });
  mocks.directory.mockReset().mockResolvedValue([
    { id: 'creator-id', email: 'creator@example.com' },
    { id: 'employee-id', email: 'employee@example.com' },
  ]);
  mocks.taskDocuments.mockReset().mockResolvedValue([]);
  window.sessionStorage.setItem('c17.web.session.v1', JSON.stringify({ access_token: 'token', refresh_token: 'refresh', expires_in_seconds: 3600, role: 'EMPLOYEE', userId: 'employee-id', expiresAt: Date.now() + 3600000 }));
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

it('creates a sub-task from the parent detail with the parent id and default reviewer', async () => {
  render(<TaskDetail id={parentTask.id} />);
  fireEvent.click(await screen.findByRole('button', { name: /tạo sub-task/i }));
  fireEvent.change(screen.getByLabelText('Tiêu đề task'), { target: { value: 'Kiểm tra phụ lục' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Người được giao' }), { target: { value: 'creator-id' } });
  fireEvent.click(screen.getByRole('button', { name: 'Giao task' }));

  await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Kiểm tra phụ lục', assignee_id: 'creator-id', reviewer_id: 'employee-id', parent_task_id: parentTask.id,
  })));
  expect(screen.queryByRole('combobox', { name: /công việc cha/i })).not.toBeInTheDocument();
});

it('enables sub-task creation for an explicit parent participant', async () => {
  mocks.get.mockResolvedValueOnce({ ...parentTask, assignee_id: 'other-employee-id' });
  mocks.participants.mockResolvedValueOnce([
    {
      id: 'participant-id',
      task_id: parentTask.id,
      user_id: 'employee-id',
      role: 'PARTICIPANT',
      added_at: '2026-08-08T00:00:00.000Z',
    },
  ]);
  mocks.directory.mockResolvedValueOnce([
    { id: 'creator-id', email: 'creator@example.com' },
    { id: 'employee-id', email: 'employee@example.com' },
    { id: 'other-employee-id', email: 'other@example.com' },
  ]);

  render(<TaskDetail id={parentTask.id} />);
  const button = await screen.findByRole('button', { name: /tạo sub-task/i });
  expect(button).toBeEnabled();
  expect(screen.queryByText(/chỉ người tham gia trực tiếp task cha mới có thể tạo sub-task/i)).not.toBeInTheDocument();
  fireEvent.click(button);
  expect(await screen.findByRole('heading', { name: 'Giao một phần việc' })).toBeInTheDocument();
});
