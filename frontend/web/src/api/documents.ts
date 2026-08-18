import { gatewayClient } from './client';
import type { Document, DocumentUploadResult, DocumentVersion, DownloadTicket, PreviewSession, TaskDocument } from '@/types/document';
import type { Grant } from '@/types/grant';
import type { PaginatedResponse } from '@/types/pagination';

const pageQuery = (page: number, pageSize: number) => `page=${page}&page_size=${pageSize}`;

export const documentsApi = {
  list: () => gatewayClient.getList<Document>('/documents'),
  listPage: (page = 1, pageSize = 20): Promise<PaginatedResponse<Document>> => gatewayClient.getPage<Document>(`/documents?${pageQuery(page, pageSize)}`),
  get: (id: string) => gatewayClient.get<Document>(`/documents/${encodeURIComponent(id)}`),
  versions: (id: string) => gatewayClient.getList<DocumentVersion>(`/documents/${encodeURIComponent(id)}/versions`),
  taskDocuments: (taskId: string) => gatewayClient.getList<TaskDocument>(`/tasks/${encodeURIComponent(taskId)}/documents`),
  addGrant: (taskId: string, documentId: string, grant: { actor_id: string; permissions: string[]; expires_at: string; parent_grant_id?: string }) => gatewayClient.post<Grant>(`/tasks/${encodeURIComponent(taskId)}/documents/${encodeURIComponent(documentId)}/grants`, grant),
  listGrants: (taskId: string, documentId: string) => gatewayClient.get<{ items: Grant[] }>(`/tasks/${encodeURIComponent(taskId)}/documents/${encodeURIComponent(documentId)}/grants`),
  updateGrant: (taskId: string, documentId: string, grantId: string, update: { permissions: string[]; expires_at: string }) => gatewayClient.patch<Grant>(`/tasks/${encodeURIComponent(taskId)}/documents/${encodeURIComponent(documentId)}/grants/${encodeURIComponent(grantId)}`, update),
  revokeGrant: (taskId: string, documentId: string, grantId: string, reason?: string) => gatewayClient.delete<Grant>(`/tasks/${encodeURIComponent(taskId)}/documents/${encodeURIComponent(documentId)}/grants/${encodeURIComponent(grantId)}`, reason ? { reason } : {}),
  taskDocumentsPage: (taskId: string, page = 1, pageSize = 20): Promise<PaginatedResponse<TaskDocument>> => gatewayClient.getPage<TaskDocument>(`/tasks/${encodeURIComponent(taskId)}/documents?${pageQuery(page, pageSize)}`),
  attachToTask: (taskId: string, documentId: string, grants: Array<{ actor_id: string; permissions: string[]; expires_at: string }>) => gatewayClient.post<DocumentUploadResult>(`/tasks/${encodeURIComponent(taskId)}/documents`, { document_id: documentId, grants }),
  detachFromTask: (taskId: string, documentId: string) => gatewayClient.delete<void>(`/tasks/${encodeURIComponent(taskId)}/documents/${encodeURIComponent(documentId)}`),
  upload: (data: FormData, onProgress: (percent: number) => void) => gatewayClient.postFormWithProgress<DocumentUploadResult>('/documents/upload', data, onProgress),
  preview: (id: string) => gatewayClient.get<{ id: string; title: string; security_level: string; document_type: string }>(`/documents/${encodeURIComponent(id)}/preview`),
  ticket: (id: string, version: number, taskId: string) => gatewayClient.post<DownloadTicket>(`/documents/${encodeURIComponent(id)}/download-ticket`, { task_id: taskId, version }),
  redeem: (id: string, version: number, ticketId: string) => gatewayClient.postBlob(`/documents/${encodeURIComponent(id)}/versions/${version}/redeem`, { ticket_id: ticketId }),
  createPreviewSession: (id: string, version: number, taskId?: string) => gatewayClient.post<PreviewSession>(`/documents/${encodeURIComponent(id)}/versions/${version}/preview-session`, taskId ? { task_id: taskId } : {}),
  extendPreviewSession: (id: string, version: number, sessionId: string, toPage: number) => gatewayClient.post<{ page_count: number; total_pages: number }>(`/documents/${encodeURIComponent(id)}/versions/${version}/preview-session/${encodeURIComponent(sessionId)}/pages`, { to_page: toPage }),
  getPreviewPage: (id: string, version: number, sessionId: string, page: number) => gatewayClient.getBlob(`/documents/${encodeURIComponent(id)}/versions/${version}/preview-session/${encodeURIComponent(sessionId)}/pages/${page}`),
  revokePreviewSession: (id: string, version: number, sessionId: string) => gatewayClient.post<void>(`/documents/${encodeURIComponent(id)}/versions/${version}/preview-session/${encodeURIComponent(sessionId)}/revoke`),
};
