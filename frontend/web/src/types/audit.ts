export interface AuditEventMetadata {
  id: string;
  event_type: string;
  occurred_at: string;
  resource_type: string;
  sequence_number: number;
}

export interface AuditChainVerification { valid: boolean; broken_at?: number; }
