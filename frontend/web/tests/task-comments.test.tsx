import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TaskComments } from '@/features/tasks/task-comments';

const mocks = vi.hoisted(() => ({ get: vi.fn(), comments: vi.fn(), comment: vi.fn(), directory: vi.fn() }));

vi.mock('@/api/tasks', () => ({ tasksApi: { get: mocks.get, comments: mocks.comments, comment: mocks.comment } }));
vi.mock('@/api/admin', () => ({ adminApi: { directory: mocks.directory } }));

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue({ id: 'task-id', title: 'Kế hoạch kiểm toán', description: null, status: 'IN_PROGRESS', creator_id: 'creator-id', assignee_id: 'employee-id', reviewer_id: 'creator-id', parent_task_id: null, deadline: null, blocked: false, blocked_reason: null, result: null, is_overdue: false, created_at: '2026-08-08T00:00:00Z', updated_at: '2026-08-10T00:00:00Z' });
  mocks.comments.mockReset().mockResolvedValue([{ id: 'comment-1', task_id: 'task-id', author_id: 'employee-id', content: 'Đã cập nhật phụ lục.', created_at: '2026-08-10T10:00:00Z' }]);
  mocks.comment.mockReset().mockResolvedValue({ id: 'comment-2', created_at: '2026-08-10T11:00:00Z' });
  mocks.directory.mockReset().mockResolvedValue([{ id: 'employee-id', email: 'employee@example.com' }]);
});

afterEach(cleanup);

it('keeps task comments on an official page and posts through the existing task API', async () => {
  render(<TaskComments id="task-id" />);

  expect(await screen.findByRole('heading', { name: 'Bình luận' })).toBeInTheDocument();
  expect(screen.getByText('Đã cập nhật phụ lục.')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Viết bình luận'), { target: { value: 'Mình đã kiểm tra xong.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng bình luận' }));

  await waitFor(() => expect(mocks.comment).toHaveBeenCalledWith('task-id', 'Mình đã kiểm tra xong.'));
});
