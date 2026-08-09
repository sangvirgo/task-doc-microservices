import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskList } from '@/features/tasks/task-list';

const mocks = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn(), directory: vi.fn() }));

vi.mock('@/api/tasks', () => ({ tasksApi: { create: mocks.create, list: mocks.list } }));
vi.mock('@/api/admin', () => ({ adminApi: { directory: mocks.directory } }));

const createdTask = {
  id: 'task-created', title: 'Rà soát hồ sơ', description: null, status: 'ASSIGNED' as const,
  creator_id: 'creator-id', assignee_id: 'employee-id', reviewer_id: 'creator-id', parent_task_id: null,
  deadline: null, blocked: false, blocked_reason: null, result: null, is_overdue: false,
  created_at: '2026-08-07T00:00:00.000Z', updated_at: '2026-08-07T00:00:00.000Z',
};

describe('task list creation flow', () => {
  beforeEach(() => {
    mocks.list.mockReset().mockResolvedValue([]);
    mocks.directory.mockReset().mockResolvedValue([
      { id: 'creator-id', email: 'creator@example.com' },
      { id: 'employee-id', email: 'employee@example.com' },
    ]);
    mocks.create.mockReset().mockResolvedValue(createdTask);
    window.sessionStorage.setItem('c17.web.session.v1', JSON.stringify({ access_token: 'token', refresh_token: 'refresh', expires_in_seconds: 3600, role: 'EMPLOYEE', userId: 'creator-id', expiresAt: Date.now() + 3600000 }));
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it('creates only the parent task and defaults the reviewer to the creator', async () => {
    render(<TaskList />);
    fireEvent.click((await screen.findAllByRole('button', { name: /new task/i }))[0]);

    expect(screen.queryByLabelText('Tiêu đề sub-task')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hết hạn truy cập')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tiêu đề task'), { target: { value: 'Rà soát hồ sơ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Người được giao' }), { target: { value: 'employee-id' } });
    fireEvent.click(screen.getByRole('button', { name: 'Giao task' }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      title: 'Rà soát hồ sơ', assignee_id: 'employee-id', reviewer_id: 'creator-id',
    }));
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('parent_task_id');
    expect(await screen.findByRole('link', { name: /mở task để xem chi tiết và gắn tài liệu/i })).toHaveAttribute('href', '/tasks/task-created');
  });

  it('keeps the drawer values and shows the API error for a retry', async () => {
    mocks.create.mockRejectedValueOnce(new Error('offline'));
    render(<TaskList />);
    fireEvent.click((await screen.findAllByRole('button', { name: /new task/i }))[0]);
    const title = screen.getByLabelText('Tiêu đề task');
    fireEvent.change(title, { target: { value: 'Task cần thử lại' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo task' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tạo task.');
    expect(title).toHaveValue('Task cần thử lại');
  });
});
