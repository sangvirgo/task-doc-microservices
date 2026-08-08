import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TaskDocuments } from '@/features/tasks/task-documents';

const mocks = vi.hoisted(() => ({ taskDocuments: vi.fn(), preview: vi.fn(), ticket: vi.fn(), redeem: vi.fn() }));
vi.mock('@/api/documents', () => ({ documentsApi: mocks }));

const task = { id: 'task-id', title: 'Task preview only', description: null, status: 'CREATED' as const, creator_id: 'employee-id', assignee_id: 'employee-id', parent_task_id: null, deadline: null, blocked: false, blocked_reason: null, result: null, is_overdue: false, created_at: '2026-08-08T00:00:00.000Z', updated_at: '2026-08-08T00:00:00.000Z' };

beforeEach(() => {
  mocks.taskDocuments.mockReset().mockResolvedValue([{ association_id: 'association-id', task_id: task.id, document_id: 'document-id', title: 'Bao cao', document_type: 'PDF', security_level: 'INTERNAL', current_version: 1, attached_by: 'employee-id', attached_at: '2026-08-08T00:00:00.000Z', permissions: ['PREVIEW'], effective_expires_at: '2027-08-08T00:00:00.000Z' }]);
  mocks.preview.mockReset().mockResolvedValue({ id: 'document-id', title: 'Bao cao', document_type: 'PDF', security_level: 'INTERNAL' });
  mocks.ticket.mockReset();
  mocks.redeem.mockReset();
});
afterEach(cleanup);

it('routes PREVIEW-only access to preview metadata and never creates a download ticket', async () => {
  render(<TaskDocuments task={task} />);

  const previewButton = await screen.findByRole('button', { name: /xem trước/i });
  const downloadButton = screen.getByRole('button', { name: /tải xuống/i });
  expect(previewButton).toBeEnabled();
  expect(downloadButton).toBeDisabled();

  fireEvent.click(previewButton);
  await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith('document-id'));
  expect(mocks.ticket).not.toHaveBeenCalled();
  expect(mocks.redeem).not.toHaveBeenCalled();
  expect(await screen.findByText(/metadata an toàn/i)).toBeInTheDocument();
});