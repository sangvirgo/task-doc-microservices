import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { TaskDocuments } from '@/features/tasks/task-documents';

const mocks = vi.hoisted(() => ({ taskDocuments: vi.fn() }));
vi.mock('@/api/documents', () => ({ documentsApi: { taskDocuments: mocks.taskDocuments } }));

const task = {
  id: 'task-id', title: 'Task', description: null, status: 'CREATED' as const,
  creator_id: 'creator-id', assignee_id: null, parent_task_id: null, deadline: null,
  blocked: false, blocked_reason: null, result: null, is_overdue: false,
  created_at: '2026-08-08T00:00:00.000Z', updated_at: '2026-08-08T00:00:00.000Z',
};

beforeEach(() => mocks.taskDocuments.mockReset());

it('shows a retryable load error instead of reporting a false zero-file state', async () => {
  mocks.taskDocuments.mockRejectedValueOnce(new Error('gateway failed')).mockResolvedValueOnce([]);
  render(<TaskDocuments task={task} />);

  expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được tài liệu');
  expect(screen.getByText('—')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }));
  await waitFor(() => expect(mocks.taskDocuments).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('Chưa có tài liệu nào được gắn vào công việc này.')).toBeInTheDocument();
});

it('groups each file permission summary and actions in an accessible footer', async () => {
  mocks.taskDocuments.mockResolvedValueOnce([{
    association_id: 'association-id', document_id: 'document-id', title: 'Tệp kiểm toán',
    document_type: 'PDF', current_version: 1, security_level: 'INTERNAL',
    permissions: ['PREVIEW', 'DOWNLOAD'],
  }]);
  render(<TaskDocuments task={task} />);

  const footer = await screen.findByRole('group', { name: 'Thao tác với tệp Tệp kiểm toán' });
  expect(within(footer).getByText('PREVIEW · DOWNLOAD')).toBeInTheDocument();
  expect(within(footer).getByRole('button', { name: 'Xem trước' })).toBeInTheDocument();
  expect(within(footer).getByRole('button', { name: 'Tải xuống' })).toBeInTheDocument();
});
