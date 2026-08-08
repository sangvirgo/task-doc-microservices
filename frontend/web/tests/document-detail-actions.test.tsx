import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DocumentDetail } from '@/features/documents/document-detail';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  versions: vi.fn(),
  taskDocuments: vi.fn(),
  ticket: vi.fn(),
  redeem: vi.fn(),
  createPreviewSession: vi.fn(),
  getPreviewPage: vi.fn(),
  revokePreviewSession: vi.fn(),
  tasks: vi.fn(),
  grants: vi.fn(),
}));
vi.mock('@/api/documents', () => ({
  documentsApi: {
    get: mocks.get,
    versions: mocks.versions,
    taskDocuments: mocks.taskDocuments,
    ticket: mocks.ticket,
    redeem: mocks.redeem,
    createPreviewSession: mocks.createPreviewSession,
    getPreviewPage: mocks.getPreviewPage,
    revokePreviewSession: mocks.revokePreviewSession,
  },
}));
vi.mock('@/api/tasks', () => ({ tasksApi: { list: mocks.tasks } }));
vi.mock('@/api/grants', () => ({ grantsApi: { list: mocks.grants } }));

const document = { id: 'document-id', title: 'hop-dong', document_type: 'PDF', owner_id: 'employee-id', creator_id: 'employee-id', security_level: 'INTERNAL' as const, status: 'UPLOADED', current_version: 1, retention_policy: null, archive_status: null, record_id: null, created_at: '2026-08-08T00:00:00.000Z', updated_at: '2026-08-08T00:00:00.000Z' };
const version = { id: 'version-id', document_id: 'document-id', version: 1, signature: null, file_size: 12, mime_type: 'application/pdf', created_by: 'employee-id', created_at: '2026-08-08T00:00:00.000Z' };
const task = { id: 'task-id', title: 'Task có tài liệu', description: null, status: 'CREATED' as const, creator_id: 'employee-id', assignee_id: 'employee-id', parent_task_id: null, deadline: null, blocked: false, blocked_reason: null, result: null, is_overdue: false, created_at: '2026-08-08T00:00:00.000Z', updated_at: '2026-08-08T00:00:00.000Z' };
const taskDocument = { association_id: 'association-id', task_id: task.id, document_id: document.id, title: document.title, document_type: document.document_type, security_level: document.security_level, current_version: 1, attached_by: 'employee-id', attached_at: '2026-08-08T00:00:00.000Z', permissions: ['PREVIEW', 'DOWNLOAD'], effective_expires_at: '2027-08-08T00:00:00.000Z' };

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue(document);
  mocks.versions.mockReset().mockResolvedValue([version]);
  mocks.tasks.mockReset().mockResolvedValue([task]);
  mocks.grants.mockReset().mockResolvedValue([]);
  window.sessionStorage.setItem('c17.web.session.v1', JSON.stringify({ role: 'EMPLOYEE', userId: 'employee-id', access_token: 'token', refresh_token: 'refresh', expires_in_seconds: 3600, expiresAt: Date.now() + 3600000 }));
  mocks.taskDocuments.mockReset().mockResolvedValue([taskDocument]);
  mocks.ticket.mockReset().mockResolvedValue({ id: 'ticket-id' });
  mocks.redeem.mockReset().mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
  mocks.createPreviewSession.mockReset().mockResolvedValue({ id: 'preview-session-id', document_id: document.id, version: 1, page_count: 0, mime_type: 'image/webp', expires_at: '2026-08-08T01:00:00.000Z', title: document.title, capabilities: { preview: true, download: true } });
  mocks.getPreviewPage.mockReset();
  mocks.revokePreviewSession.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:document-download'), revokeObjectURL: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('creates a secure preview session without a download ticket, then downloads with task context', async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  render(<DocumentDetail id="document-id" />);

  expect(await screen.findByLabelText('Công việc được ủy quyền')).toHaveValue(task.title);
  fireEvent.click(screen.getAllByRole('button', { name: /xem trước/i })[0]);

  await waitFor(() => expect(mocks.createPreviewSession).toHaveBeenCalledWith('document-id', 1, 'task-id'));
  expect(mocks.ticket).not.toHaveBeenCalled();
  expect(mocks.redeem).not.toHaveBeenCalled();
  expect(await screen.findByLabelText('Preview only warning')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /tải bản mới nhất/i }));
  await waitFor(() => expect(mocks.ticket).toHaveBeenCalledWith('document-id', 1, 'task-id'));
  expect(mocks.redeem).toHaveBeenCalledWith('document-id', 1, 'ticket-id');
  expect(click).toHaveBeenCalled();
  click.mockRestore();
});

it('uses an active DOWNLOAD grant task_id when task discovery cannot find an association', async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  mocks.tasks.mockResolvedValue([]);
  mocks.grants.mockResolvedValue([{ id: 'grant-id', grantor_id: 'employee-id', actor_id: 'employee-id', resource_type: 'DOCUMENT', resource_id: 'document-id', permissions: ['PREVIEW', 'DOWNLOAD'], task_id: 'grant-task-id', expires_at: '2027-08-08T00:00:00.000Z', effective_expires_at: '2027-08-08T00:00:00.000Z', status: 'ACTIVE', revoked_at: null, parent_grant_id: null, created_at: '2026-08-08T00:00:00.000Z' }]);
  render(<DocumentDetail id="document-id" />);

  const downloadButton = await screen.findByRole('button', { name: /tải bản mới nhất/i });
  await waitFor(() => expect(downloadButton).toBeEnabled());
  fireEvent.click(downloadButton);

  await waitFor(() => expect(mocks.ticket).toHaveBeenCalledWith('document-id', 1, 'grant-task-id'));
  expect(mocks.redeem).toHaveBeenCalledWith('document-id', 1, 'ticket-id');
  expect(await screen.findByText(/PREVIEW · DOWNLOAD/i)).toBeInTheDocument();
  click.mockRestore();
});

it('creates preview pages but keeps download disabled for a PREVIEW-only grant', async () => {
  mocks.tasks.mockResolvedValue([]);
  mocks.grants.mockResolvedValue([{ id: 'grant-id', grantor_id: 'employee-id', actor_id: 'employee-id', resource_type: 'DOCUMENT', resource_id: 'document-id', permissions: ['PREVIEW'], task_id: 'preview-task-id', expires_at: '2027-08-08T00:00:00.000Z', effective_expires_at: '2027-08-08T00:00:00.000Z', status: 'ACTIVE', revoked_at: null, parent_grant_id: null, created_at: '2026-08-08T00:00:00.000Z' }]);
  mocks.createPreviewSession.mockResolvedValue({ id: 'preview-session-id', document_id: document.id, version: 1, page_count: 0, mime_type: 'image/webp', expires_at: '2026-08-08T01:00:00.000Z', title: document.title, capabilities: { preview: true, download: false } });
  render(<DocumentDetail id="document-id" />);

  const previewButton = (await screen.findAllByRole('button', { name: /xem trước/i }))[0];
  const downloadButton = screen.getByRole('button', { name: /tải bản mới nhất/i });
  await waitFor(() => expect(previewButton).toBeEnabled());
  expect(downloadButton).toBeDisabled();

  fireEvent.click(previewButton);
  await waitFor(() => expect(mocks.createPreviewSession).toHaveBeenCalledWith('document-id', 1, 'preview-task-id'));
  expect(mocks.ticket).not.toHaveBeenCalled();
  expect(mocks.redeem).not.toHaveBeenCalled();
  expect(await screen.findByLabelText('Preview only warning')).toBeInTheDocument();
  expect(screen.getByText(/Chỉ được xem trước/i)).toBeInTheDocument();
});