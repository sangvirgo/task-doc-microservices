import { gatewayClient } from './client';
import type { Document, DocumentVersion, DownloadTicket, PreviewSession } from '@/types/document';
export const documentsApi = {
  list: () => gatewayClient.get<Document[]>('/documents'),
  get: (id: string) => gatewayClient.get<Document>(`/documents/${encodeURIComponent(id)}`),
  versions: (id: string) => gatewayClient.get<DocumentVersion[]>(`/documents/${encodeURIComponent(id)}/versions`),
  upload: (data: FormData, onProgress: (percent: number) => void) => gatewayClient.postFormWithProgress<{ document: Document; version: DocumentVersion }>('/documents/upload', data, onProgress),
  preview: (id: string) => gatewayClient.get<{ id: string; title: string; security_level: string; document_type: string }>(`/documents/${encodeURIComponent(id)}/preview`),
  ticket: (id: string, version: number, taskId: string) => gatewayClient.post<DownloadTicket>(`/documents/${encodeURIComponent(id)}/download-ticket`, { task_id: taskId, version }),
  redeem: (id: string, version: number, ticketId: string) => gatewayClient.postBlob(`/documents/${encodeURIComponent(id)}/versions/${version}/redeem`, { ticket_id: ticketId }),
  createPreviewSession: (id: string, version: number, taskId?: string) => gatewayClient.post<PreviewSession>(`/documents/${encodeURIComponent(id)}/versions/${version}/preview-session`, taskId ? { task_id: taskId } : {}),
  getPreviewPage: (id: string, version: number, sessionId: string, page: number) => gatewayClient.getBlob(`/documents/${encodeURIComponent(id)}/versions/${version}/preview-session/${encodeURIComponent(sessionId)}/pages/${page}`),
  revokePreviewSession: (id: string, version: number, sessionId: string) => gatewayClient.post<void>(`/documents/${encodeURIComponent(id)}/versions/${version}/preview-session/${encodeURIComponent(sessionId)}/revoke`),
};
