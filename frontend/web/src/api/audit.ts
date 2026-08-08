import { gatewayClient } from './client';
import type { AuditChainVerification, AuditEventMetadata } from '@/types/audit';

interface AuditEventResponse extends AuditEventMetadata { actor_id: string | null; resource_id: string; payload: Record<string, unknown>; previous_hash: string; current_hash: string; created_at: string; }

export const auditApi = {
  events: () => gatewayClient.getList<AuditEventResponse>('/audit/events?limit=50').then((items) => items.map(({ id, event_type, occurred_at, resource_type, sequence_number }) => ({ id, event_type, occurred_at, resource_type, sequence_number }))),
  verify: () => gatewayClient.post<AuditChainVerification>('/audit/chain/verify'),
};
