import { gatewayClient } from './client';
import type { CreateGrantInput, Grant } from '@/types/grant';

export interface GrantListFilters {
  actor_id?: string;
  grantor_id?: string;
  resource_type?: string;
  resource_id?: string;
  status?: string;
  task_id?: string;
}

export const grantsApi = {
  list: (filters: GrantListFilters | string = {}) => {
    const normalizedFilters = typeof filters === 'string' ? { actor_id: filters } : filters;
    const params = new URLSearchParams();
    Object.entries(normalizedFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const query = params.toString();
    return gatewayClient.getList<Grant>('/permissions/grants' + (query ? '?' + query : ''));
  },
  get: (id: string) => gatewayClient.get<Grant>(`/permissions/grants/${encodeURIComponent(id)}`),
  create: (input: CreateGrantInput) => gatewayClient.post<Grant>('/permissions/grants', input),
  delegate: (id: string, actorId: string, permissions?: string[]) => gatewayClient.post<Grant>(`/permissions/grants/${encodeURIComponent(id)}/delegate`, { actor_id: actorId, ...(permissions ? { permissions } : {}) }),
  revoke: (id: string, reason?: string) => gatewayClient.delete<Grant>(`/permissions/grants/${encodeURIComponent(id)}`, reason ? { reason } : {}),
};
