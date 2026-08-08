export interface Document { id: string; title: string; document_type: string; owner_id: string; creator_id: string; security_level: 'PUBLIC'|'INTERNAL'|'CONFIDENTIAL'|'RESTRICTED'; status: string; current_version: number; retention_policy: string | null; archive_status: string | null; record_id: string | null; created_at: string; updated_at: string; }
export interface DocumentVersion { id: string; document_id: string; version: number; signature: string | null; file_size: number; mime_type: string; created_by: string; created_at: string; }
interface Ticket { id: string; document_id: string; version: number; actor_id: string; expires_at: string; }
export type DownloadTicket = Ticket;
export interface PreviewSession { id: string; document_id: string; version: number; page_count: number; mime_type: string; expires_at: string; title: string; capabilities: { preview: boolean; download: boolean }; }
