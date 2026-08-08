export interface Document { id: string; title: string; document_type: string; owner_id: string; creator_id: string; security_level: 'PUBLIC'|'INTERNAL'|'CONFIDENTIAL'|'RESTRICTED'; status: string; current_version: number; retention_policy: string | null; archive_status: string | null; record_id: string | null; created_at: string; updated_at: string; }
export interface DocumentVersion { id: string; document_id: string; version: number; signature: string | null; file_size: number; mime_type: string; created_by: string; created_at: string; }
interface Ticket { id: string; document_id: string; version: number; actor_id: string; expires_at: string; }
export type DownloadTicket = Ticket;

export interface TaskDocument {
  association_id: string;
  task_id: string;
  document_id: string;
  title: string;
  document_type: string;
  security_level: Document['security_level'];
  current_version: number;
  attached_by: string;
  attached_at: string;
  permissions: string[];
  effective_expires_at: string | null;
}

export interface DocumentUploadResult {
  document: Document;
  version: DocumentVersion;
  association?: { id: string; task_id: string; document_id: string; attached_by: string; attached_at: string };
  grants?: Array<{ id: string; actor_id: string; permissions: string[]; task_id: string; expires_at: string }>;
}