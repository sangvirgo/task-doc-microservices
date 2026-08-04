export interface RetentionHold {
  id: string;
  document_id: string;
  reason: string;
  placed_by: string;
  placed_at: string;
  released_at: string | null;
}

export interface DisposalApproval {
  id: string;
  document_id: string;
  approver_id: string;
  reason: string;
  approved_at: string;
}

export interface EligibilityResult {
  eligible_count: number;
  eligible_ids: string[];
}

export interface DisposalResult {
  id: string;
  document_id: string;
  status: string;
  objects_deleted: number;
}
