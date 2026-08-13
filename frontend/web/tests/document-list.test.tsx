import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { writeSession, clearSession } from '@/auth/session';
import { DocumentList } from '@/features/documents/document-list';

const mocks = vi.hoisted(() => ({ list: vi.fn(), taskDocuments: vi.fn(), upload: vi.fn(), tasks: vi.fn() }));

vi.mock('@/api/documents', () => ({ documentsApi: { list: mocks.list, taskDocuments: mocks.taskDocuments, upload: mocks.upload } }));
vi.mock('@/api/tasks', () => ({ tasksApi: { list: mocks.tasks } }));

const task = { id: 'task-id', title: 'Kế hoạch kiểm toán', description: null, status: 'IN_PROGRESS' as const, creator_id: 'creator-id', assignee_id: 'user-id', reviewer_id: 'reviewer-id', parent_task_id: null, deadline: null, blocked: false, blocked_reason: null, result: null, is_overdue: false, created_at: '2026-08-08T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z' };
const taskDocument = { association_id: 'association-id', task_id: task.id, document_id: 'document-id', title: 'Bao cao', document_type: 'PDF', security_level: 'INTERNAL' as const, current_version: 2, attached_by: 'creator-id', attached_at: '2026-08-08T00:00:00.000Z', permissions: ['PREVIEW', 'DOWNLOAD'], effective_expires_at: null };

beforeEach(() => {
  mocks.list.mockReset().mockResolvedValue([{ id: 'document-id', title: 'Bao cao', document_type: 'PDF', owner_id: 'creator-id', creator_id: 'creator-id', security_level: 'INTERNAL', status: 'ACTIVE', current_version: 2, retention_policy: null, archive_status: null, record_id: null, created_at: '2026-08-08T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z' }]);
  mocks.tasks.mockReset().mockResolvedValue([task]);
  mocks.taskDocuments.mockReset().mockResolvedValue([taskDocument]);
  mocks.upload.mockReset().mockResolvedValue({ document: { id: 'new-document-id' } });
  writeSession({ access_token: `header.${btoa(JSON.stringify({ role: 'EMPLOYEE', sub: 'user-id' }))}.signature`, refresh_token: 'refresh', expires_in_seconds: 3600 });
});

afterEach(() => { cleanup(); clearSession(); });

it('groups documents by task and shows effective permissions', async () => {
  render(<DocumentList />);
  expect(await screen.findByRole('heading', { name: 'Kế hoạch kiểm toán' })).toBeInTheDocument();
  expect(screen.getByText('Bao cao')).toBeVisible();
  expect(screen.getByText('PREVIEW')).toBeVisible();
  expect(screen.getByText('DOWNLOAD')).toBeVisible();
});

it('requires a task in the upload form and sends its association metadata', async () => {
  render(<DocumentList />);
  await screen.findByText('Bao cao');
  fireEvent.change(screen.getByLabelText(/tệp tải lên/i), { target: { files: [new File(['content'], 'new.pdf', { type: 'application/pdf' })] } });
  fireEvent.focus(screen.getByRole('combobox', { name: 'Chọn task để upload' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Kế hoạch kiểm toán' }));
  fireEvent.click(screen.getByRole('button', { name: /tải tài liệu lên/i }));

  await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
  const payload = mocks.upload.mock.calls[0][0] as FormData;
  expect(payload.get('task_id')).toBe(task.id);
  expect(JSON.parse(String(payload.get('grants')))).toEqual(expect.arrayContaining([expect.objectContaining({ actor_id: 'user-id' }), expect.objectContaining({ actor_id: 'creator-id' })]));
  expect(await screen.findByText('Đã tải và phân loại tài liệu theo task.')).toBeInTheDocument();
});
