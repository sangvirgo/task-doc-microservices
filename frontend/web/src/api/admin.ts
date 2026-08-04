import { gatewayClient } from './client';
import type { ManagedUser, SecurityAlert, SecurityRule } from '@/types/admin';

export const adminApi = {
  users: () => gatewayClient.get<ManagedUser[]>('/users'),
  user: (id: string) => gatewayClient.get<ManagedUser>(`/users/${encodeURIComponent(id)}`),
  createUser: (input: Pick<ManagedUser, 'id' | 'email' | 'role'>) => gatewayClient.post<ManagedUser>('/users', input),
  lock: (id: string) => gatewayClient.post<ManagedUser>(`/users/${encodeURIComponent(id)}/lock`),
  unlock: (id: string) => gatewayClient.post<ManagedUser>(`/users/${encodeURIComponent(id)}/unlock`),
  grantCapability: (id: string, capability: string) => gatewayClient.post<ManagedUser>(`/users/${encodeURIComponent(id)}/capabilities`, { capability }),
  revokeCapability: (id: string, capability: string) => gatewayClient.delete<ManagedUser>(`/users/${encodeURIComponent(id)}/capabilities/${encodeURIComponent(capability)}`),
  alerts: () => gatewayClient.get<SecurityAlert[]>('/monitoring/alerts'),
  resolveAlert: (id: string, resolved_by: string) => gatewayClient.post<SecurityAlert>(`/monitoring/alerts/${encodeURIComponent(id)}/resolve`, { resolved_by }),
  rules: () => gatewayClient.get<SecurityRule[]>('/monitoring/rules'),
  createRule: (input: { name: string; description?: string; rule_type: string; threshold?: number; window_minutes?: number; action?: 'ALERT' | 'BLOCK' }) => gatewayClient.post<SecurityRule>('/monitoring/rules', input),
  toggleRule: (id: string, enabled: boolean) => gatewayClient.put<SecurityRule>(`/monitoring/rules/${encodeURIComponent(id)}/toggle`, { enabled }),
};
