import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TaskDetail } from '@/features/tasks/task-detail';

const mocks = vi.hoisted(() => ({ get: vi.fn(), participants: vi.fn(), activity: vi.fn(), comments: vi.fn(), submissions: vi.fn(), directory: vi.fn(), taskDocuments: vi.fn(), submit: vi.fn(), review: vi.fn() }));

vi.mock('@/api/tasks', () => ({ tasksApi: { get: mocks.get, participants: mocks.participants, activity: mocks.activity, comments: mocks.comments, submissions: mocks.submissions, submit: mocks.submit, review: mocks.review } }));
vi.mock('@/api/admin', () => ({ adminApi: { directory: mocks.directory } }));
vi.mock('@/api/documents', () => ({ documentsApi: { taskDocuments: mocks.taskDocuments } }));

const task = (status: 'IN_PROGRESS' | 'WAITING_REVIEW') => ({ id: 'task-id', title: 'Kế hoạch kiểm toán', description: 'Task workflow', status, creator_id: 'creator-id', assignee_id: 'employee-id', reviewer_id: 'reviewer-id', parent_task_id: null, deadline: null, blocked: false, blocked_reason: null, result: null, is_overdue: false, created_at: '2026-08-08T00:00:00Z', updated_at: '2026-08-10T00:00:00Z' });

beforeEach(() => {
  mocks.participants.mockReset().mockResolvedValue([]);
  mocks.activity.mockReset().mockResolvedValue([]);
  mocks.comments.mockReset().mockResolvedValue([]);
  mocks.directory.mockReset().mockResolvedValue([]);
  mocks.taskDocuments.mockReset().mockResolvedValue([]);
  mocks.submissions.mockReset().mockResolvedValue([]);
  mocks.submit.mockReset().mockResolvedValue({ id: 'submission-id', status: 'PENDING', created_at: '2026-08-10T10:00:00Z' });
  mocks.review.mockReset().mockResolvedValue({ id: 'submission-id', status: 'APPROVED' });
});

afterEach(() => { cleanup(); window.sessionStorage.clear(); });

it('shows submit only to the assignee while the task is IN_PROGRESS', async () => {
  mocks.get.mockResolvedValue(task('IN_PROGRESS'));
  window.sessionStorage.setItem('c17.web.session.v1', JSON.stringify({ access_token: 'token', refresh_token: 'refresh', expires_in_seconds: 3600, role: 'EMPLOYEE', userId: 'employee-id', expiresAt: Date.now() + 3600000 }));

  render(<TaskDetail id="task-id" />);

  expect(await screen.findByRole('heading', { name: 'Nộp kết quả' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Phê duyệt submission' })).not.toBeInTheDocument();
});

it('shows review only to the configured reviewer while the task is WAITING_REVIEW', async () => {
  mocks.get.mockResolvedValue(task('WAITING_REVIEW'));
  mocks.submissions.mockResolvedValue([{ id: 'submission-id', task_id: 'task-id', author_id: 'employee-id', content: 'Kết quả', status: 'PENDING', reviewer_id: null, review_comment: null, reviewed_at: null, created_at: '2026-08-10T10:00:00Z' }]);
  window.sessionStorage.setItem('c17.web.session.v1', JSON.stringify({ access_token: 'token', refresh_token: 'refresh', expires_in_seconds: 3600, role: 'EMPLOYEE', userId: 'reviewer-id', expiresAt: Date.now() + 3600000 }));

  render(<TaskDetail id="task-id" />);

  expect(await screen.findByRole('heading', { name: 'Phê duyệt submission' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Nộp kết quả' })).not.toBeInTheDocument();
});
