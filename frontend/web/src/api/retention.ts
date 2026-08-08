import { gatewayClient } from './client';
import type { DisposalApproval, DisposalResult, EligibilityResult, RetentionHold } from '@/types/retention';

export const retentionApi = {
  checkEligibility: () => gatewayClient.post<EligibilityResult>('/retention-disposal/check-eligibility'),
  approvals: () => gatewayClient.getList<DisposalApproval>('/retention-disposal/approvals'),
  approve: (document_id: string, reason: string) => gatewayClient.post<DisposalApproval>('/retention-disposal/approve-disposal', { document_id, reason }),
  execute: (document_id: string) => gatewayClient.post<DisposalResult>('/retention-disposal/execute-disposal', { document_id }),
  holds: () => gatewayClient.getList<RetentionHold>('/retention-disposal/holds'),
  placeHold: (document_id: string, reason: string) => gatewayClient.post<RetentionHold>('/retention-disposal/holds', { document_id, reason }),
  releaseHold: (id: string) => gatewayClient.post<RetentionHold>(`/retention-disposal/holds/${encodeURIComponent(id)}/release`),
};
