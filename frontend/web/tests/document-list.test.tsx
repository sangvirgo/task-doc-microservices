import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { writeSession, clearSession } from '@/auth/session';
import { DocumentList } from '@/features/documents/document-list';

const mocks = vi.hoisted(() => ({ list: vi.fn(), taskDocuments: vi.fn(), tasks: vi.fn() }));

vi.mock('@/api/documents', () => ({ documentsApi: { list: mocks.list, taskDocuments: mocks.taskDocuments } }));
vi.mock('@/api/tasks', () => ({ tasksApi: { list: mocks.tasks } }));

const task = { id: 'task-id', title: 'Kế hoạch kiểm toán', description: null, status: 'IN_PROGRESS' as const, creator_id: 'creator-id', assignee_id: 'user-id', reviewer_id: 'reviewer-id', parent_task_id: null, deadline: '2026-08-20T00:00:00.000Z', blocked: false, blocked_reason: null, result: null, is_overdue: false, created_at: '2026-08-08T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z' };
const taskDocument = { association_id: 'association-id', task_id: task.id, document_id: 'document-id', title: 'Bao cao', document_type: 'PDF', security_level: 'INTERNAL' as const, current_version: 2, attached_by: 'creator-id', attached_at: '2026-08-08T00:00:00.000Z', permissions: ['PREVIEW', 'DOWNLOAD'], effective_expires_at: '2026-08-25T00:00:00.000Z' };

beforeEach(() => {
  mocks.list.mockReset().mockResolvedValue([{ id: 'document-id', title: 'Bao cao', document_type: 'PDF', owner_id: 'creator-id', creator_id: 'creator-id', security_level: 'INTERNAL', status: 'ACTIVE', current_version: 2, retention_policy: null, archive_status: null, record_id: null, created_at: '2026-08-08T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z' }]);
  mocks.tasks.mockReset().mockResolvedValue([task]);
  mocks.taskDocuments.mockReset().mockResolvedValue([taskDocument]);
  writeSession({ access_token: 'header.' + btoa(JSON.stringify({ role: 'EMPLOYEE', sub: 'user-id' })) + '.signature', refresh_token: 'refresh', expires_in_seconds: 3600 });
});

afterEach(() => { cleanup(); clearSession(); });

it('groups documents by task and shows deadline and effective permissions', async () => {
  render(<DocumentList />);
  expect(await screen.findByRole('heading', { name: 'Kế hoạch kiểm toán' })).toBeInTheDocument();
  expect(screen.getByText('Bao cao')).toBeVisible();
  expect(screen.getByText('Xem')).toBeVisible();
  expect(screen.getByText('Tải xuống')).toBeVisible();
  expect(screen.getByText(/Hạn · 20\/08\/2026/)).toBeVisible();
  expect(screen.getByText(/Hết hạn · 25\/08\/2026/)).toBeVisible();
  expect(screen.queryByText('Tải tài liệu lên')).not.toBeInTheDocument();
});

it('filters the read-only library by document or task name', async () => {
  render(<DocumentList />);
  await screen.findByText('Bao cao');

  fireEvent.change(screen.getByPlaceholderText('Tìm theo tên tài liệu hoặc task...'), { target: { value: 'kế hoạch' } });
  expect(screen.getByRole('heading', { name: 'Kế hoạch kiểm toán' })).toBeVisible();

  fireEvent.change(screen.getByPlaceholderText('Tìm theo tên tài liệu hoặc task...'), { target: { value: 'không tồn tại' } });
  expect(await screen.findByText('Không tìm thấy tài liệu')).toBeVisible();
});
