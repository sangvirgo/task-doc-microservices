import { gatewayClient } from './client';
import type { AuditChainHead, AuditChainVerification, AuditEventMetadata } from '@/types/audit';

interface AuditEventResponse extends AuditEventMetadata {
  actor_id: string | null;
  resource_id: string;
  payload: Record<string, unknown>;
  previous_hash: string;
  current_hash: string;
  created_at: string;
}

export const auditApi = {
  events: (page = 1, pageSize = 50, eventType?: string) =>
    gatewayClient
      .getPage<AuditEventResponse>(
        '/audit/events?page=' + page + '&page_size=' + pageSize + (eventType ? '&event_type=' + encodeURIComponent(eventType) : ''),
      )
      .then(({ items, pagination }) => ({
        items: items.map(({ id, event_type, occurred_at, resource_type, sequence_number, actor_id, resource_id }) => ({
          id,
          event_type,
          occurred_at,
          resource_type,
          sequence_number,
          actor_id,
          resource_id,
        })),
        pagination,
      })),
  allEvents: (page = 1, pageSize = 50) =>
    gatewayClient
      .getPage<AuditEventResponse>('/audit/events?all=true&page=' + page + '&page_size=' + pageSize)
      .then(({ items, pagination }) => ({
        items: items.map(({ id, event_type, occurred_at, resource_type, sequence_number, actor_id, resource_id }) => ({
          id,
          event_type,
          occurred_at,
          resource_type,
          sequence_number,
          actor_id,
          resource_id,
        })),
        pagination,
      })),
  chainHead: () => gatewayClient.get<AuditChainHead>('/audit/chain/head'),
  verify: () => gatewayClient.post<AuditChainVerification>('/audit/chain/verify'),
};

export type AuditEventsPage = Awaited<ReturnType<typeof auditApi.events>>;
