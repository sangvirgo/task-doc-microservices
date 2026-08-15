import { gatewayClient } from './client';
import type { AuditChainHead, AuditChainVerification, AuditEventMetadata } from '@/types/audit';

interface AuditEventResponse extends AuditEventMetadata { actor_id: string | null; resource_id: string; payload: Record<string, unknown>; previous_hash: string; current_hash: string; created_at: string; }

export const auditApi = {
  events: (eventType?: string) => gatewayClient.getList<AuditEventResponse>(`/audit/events?page_size=50${eventType ? `&event_type=${encodeURIComponent(eventType)}` : ''}`).then((items) => items.map(({ id, event_type, occurred_at, resource_type, sequence_number }) => ({ id, event_type, occurred_at, resource_type, sequence_number }))),
  chainHead: () => gatewayClient.get<AuditChainHead>('/audit/chain/head'),
  verify: () => gatewayClient.post<AuditChainVerification>('/audit/chain/verify'),
};
