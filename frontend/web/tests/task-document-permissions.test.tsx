import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TaskDocuments } from '@/features/tasks/task-documents';

const mocks = vi.hoisted(() => ({ taskDocuments: vi.fn(), ticket: vi.fn(), redeem: vi.fn(), createPreviewSession: vi.fn(), getPreviewPage: vi.fn(), revokePreviewSession: vi.fn() }));
vi.mock('@/api/documents', () => ({ documentsApi: mocks }));

const task = { id: 'task-id', title: 'Task preview only', description: null, status: 'CREATED' as const, creator_id: 'employee-id', assignee_id: 'employee-id', parent_task_id: null, deadline: null, blocked: false, blocked_reason: null, result: null, is_overdue: false, created_at: '2026-08-08T00:00:00.000Z', updated_at: '2026-08-08T00:00:00.000Z' };

beforeEach(() => {
  mocks.taskDocuments.mockReset().mockResolvedValue([{ association_id: 'association-id', task_id: task.id, document_id: 'document-id', title: 'Bao cao', document_type: 'PDF', security_level: 'INTERNAL', current_version: 1, attached_by: 'employee-id', attached_at: '2026-08-08T00:00:00.000Z', permissions: ['PREVIEW'], effective_expires_at: '2027-08-08T00:00:00.000Z' }]);
  mocks.createPreviewSession.mockReset().mockResolvedValue({ id: 'preview-session-id', document_id: 'document-id', version: 1, page_count: 0, mime_type: 'image/webp', expires_at: '2026-08-08T01:00:00.000Z', title: 'Bao cao', capabilities: { preview: true, download: false } });
  mocks.getPreviewPage.mockReset();
  mocks.revokePreviewSession.mockReset().mockResolvedValue(undefined);
  mocks.ticket.mockReset();
  mocks.redeem.mockReset();
});
afterEach(cleanup);

it('routes PREVIEW-only access to a secure preview session and never creates a download ticket', async () => {
  render(<TaskDocuments task={task} />);

  const previewButton = await screen.findByRole('button', { name: /xem trước/i });
  const downloadButton = screen.getByRole('button', { name: /tải xuống/i });
  expect(previewButton).toBeEnabled();
  expect(downloadButton).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Detach' })).not.toBeInTheDocument();

  fireEvent.click(previewButton);
  await waitFor(() => expect(mocks.createPreviewSession).toHaveBeenCalledWith('document-id', 1, 'task-id'));
  expect(mocks.ticket).not.toHaveBeenCalled();
  expect(mocks.redeem).not.toHaveBeenCalled();
  expect(await screen.findByLabelText('Preview only warning')).toBeInTheDocument();
});

it('hides upload when the task viewer is not a direct participant', async () => {
  render(<TaskDocuments task={task} canUpload={false} />);

  await screen.findByText('Bao cao');
  expect(screen.queryByRole('button', { name: /thêm/i })).not.toBeInTheDocument();
});
