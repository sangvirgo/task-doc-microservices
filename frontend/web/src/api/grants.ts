import { gatewayClient } from './client';
import type { CreateGrantInput, Grant } from '@/types/grant';

export const grantsApi = {
  list: (actorId: string) => gatewayClient.get<Grant[]>(`/permissions/grants?actor_id=${encodeURIComponent(actorId)}`),
  get: (id: string) => gatewayClient.get<Grant>(`/permissions/grants/${encodeURIComponent(id)}`),
  create: (input: CreateGrantInput) => gatewayClient.post<Grant>('/permissions/grants', input),
  delegate: (id: string, actorId: string, permissions?: string[]) => gatewayClient.post<Grant>(`/permissions/grants/${encodeURIComponent(id)}/delegate`, { actor_id: actorId, ...(permissions ? { permissions } : {}) }),
  revoke: (id: string, reason?: string) => gatewayClient.delete<Grant>(`/permissions/grants/${encodeURIComponent(id)}`, reason ? { reason } : {}),
};
