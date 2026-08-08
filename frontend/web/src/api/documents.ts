import { gatewayClient } from './client';
import type { Document, DocumentUploadResult, DocumentVersion, DownloadTicket, PreviewSession, TaskDocument } from '@/types/document';

export const documentsApi = {
  list: () => gatewayClient.getList<Document>('/documents'),
  get: (id: string) => gatewayClient.get<Document>(`/documents/${encodeURIComponent(id)}`),
  versions: (id: string) => gatewayClient.getList<DocumentVersion>(`/documents/${encodeURIComponent(id)}/versions`),
  taskDocuments: (taskId: string) => gatewayClient.getList<TaskDocument>(`/tasks/${encodeURIComponent(taskId)}/documents`),
  attachToTask: (taskId: string, documentId: string, grants: Array<{ actor_id: string; permissions: string[]; expires_at: string }>) => gatewayClient.post<DocumentUploadResult>(`/tasks/${encodeURIComponent(taskId)}/documents`, { document_id: documentId, grants }),
  upload: (data: FormData, onProgress: (percent: number) => void) => gatewayClient.postFormWithProgress<DocumentUploadResult>('/documents/upload', data, onProgress),
  preview: (id: string) => gatewayClient.get<{ id: string; title: string; security_level: string; document_type: string }>(`/documents/${encodeURIComponent(id)}/preview`),
  ticket: (id: string, version: number, taskId: string) => gatewayClient.post<DownloadTicket>(`/documents/${encodeURIComponent(id)}/download-ticket`, { task_id: taskId, version }),
  redeem: (id: string, version: number, ticketId: string) => gatewayClient.postBlob(`/documents/${encodeURIComponent(id)}/versions/${version}/redeem`, { ticket_id: ticketId }),
  createPreviewSession: (id: string, version: number, taskId?: string) => gatewayClient.post<PreviewSession>(`/documents/${encodeURIComponent(id)}/versions/${version}/preview-session`, taskId ? { task_id: taskId } : {}),
  getPreviewPage: (id: string, version: number, sessionId: string, page: number) => gatewayClient.getBlob(`/documents/${encodeURIComponent(id)}/versions/${version}/preview-session/${encodeURIComponent(sessionId)}/pages/${page}`),
  revokePreviewSession: (id: string, version: number, sessionId: string) => gatewayClient.post<void>(`/documents/${encodeURIComponent(id)}/versions/${version}/preview-session/${encodeURIComponent(sessionId)}/revoke`),
};