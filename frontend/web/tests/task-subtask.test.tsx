import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { TaskDetail } from '@/features/tasks/task-detail';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), participants: vi.fn(), activity: vi.fn(), comments: vi.fn(), create: vi.fn(), directory: vi.fn(), taskDocuments: vi.fn(),
}));

vi.mock('@/api/tasks', () => ({ tasksApi: { get: mocks.get, participants: mocks.participants, activity: mocks.activity, comments: mocks.comments, create: mocks.create } }));
vi.mock('@/api/admin', () => ({ adminApi: { directory: mocks.directory } }));
vi.mock('@/api/documents', () => ({ documentsApi: { taskDocuments: mocks.taskDocuments } }));

const parentTask = {
  id: 'parent-task-id', title: 'Kế hoạch kiểm toán', description: 'Task cha', status: 'CREATED' as const,
  creator_id: 'creator-id', assignee_id: null, parent_task_id: null, deadline: null, blocked: false,
  blocked_reason: null, result: null, is_overdue: false, created_at: '2026-08-08T00:00:00.000Z', updated_at: '2026-08-08T00:00:00.000Z',
};

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue(parentTask);
  mocks.participants.mockReset().mockResolvedValue([]);
  mocks.activity.mockReset().mockResolvedValue([]);
  mocks.comments.mockReset().mockResolvedValue([]);
  mocks.create.mockReset().mockResolvedValue({ ...parentTask, id: 'child-task-id', title: 'Kiểm tra phụ lục', parent_task_id: parentTask.id });
  mocks.directory.mockReset().mockResolvedValue([{ id: 'employee-id', email: 'employee@example.com' }]);
  mocks.taskDocuments.mockReset().mockResolvedValue([]);
});

it('creates a sub-task from its parent detail and assigns parent_task_id automatically', async () => {
  render(<TaskDetail id={parentTask.id} />);
  fireEvent.click(await screen.findByRole('button', { name: /tạo sub-task/i }));
  fireEvent.change(screen.getByLabelText('Tiêu đề sub-task'), { target: { value: 'Kiểm tra phụ lục' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Người được giao' }), { target: { value: 'employee-id' } });
  const submitButtons = screen.getAllByRole('button', { name: /^tạo sub-task$/i });
  fireEvent.click(submitButtons[submitButtons.length - 1]);
  await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Kiểm tra phụ lục', assignee_id: 'employee-id', parent_task_id: parentTask.id,
  })));
  expect(screen.queryByRole('combobox', { name: /công việc cha/i })).not.toBeInTheDocument();
});