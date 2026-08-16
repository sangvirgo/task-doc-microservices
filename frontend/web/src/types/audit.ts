export interface AuditEventMetadata {
  id: string;
  event_type: string;
  occurred_at: string;
  resource_type: string;
  sequence_number: number;
  actor_id?: string | null;
  resource_id?: string;
}

export interface AuditChainHead {
  last_hash: string;
  last_event_id: string | null;
  sequence: number;
}

export interface AuditChainVerification { valid: boolean; broken_at?: number; }
