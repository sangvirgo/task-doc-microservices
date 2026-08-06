import { gatewayClient } from './client';
import type { ManagedUser, MemberOption, SecurityAlert, SecurityRule } from '@/types/admin';
import type { Capability } from '@/types/capability';

export const adminApi = {
  directory: () => gatewayClient.get<MemberOption[]>('/users/directory'),
  users: () => gatewayClient.get<ManagedUser[]>('/users'),
  user: (id: string) => gatewayClient.get<ManagedUser>(`/users/${encodeURIComponent(id)}`),
  createUser: (input: Pick<ManagedUser, 'id' | 'email' | 'role'>) => gatewayClient.post<ManagedUser>('/users', input),
  lock: (id: string) => gatewayClient.post<ManagedUser>(`/users/${encodeURIComponent(id)}/lock`),
  unlock: (id: string) => gatewayClient.post<ManagedUser>(`/users/${encodeURIComponent(id)}/unlock`),
  grantCapability: (id: string, capability: Capability) => gatewayClient.post<ManagedUser>(`/users/${encodeURIComponent(id)}/capabilities`, { capability }),
  revokeCapability: (id: string, capability: Capability) => gatewayClient.delete<ManagedUser>(`/users/${encodeURIComponent(id)}/capabilities/${encodeURIComponent(capability)}`),
  alerts: () => gatewayClient.get<SecurityAlert[]>('/monitoring/alerts'),
  resolveAlert: (id: string, resolved_by: string) => gatewayClient.post<SecurityAlert>(`/monitoring/alerts/${encodeURIComponent(id)}/resolve`, { resolved_by }),
  rules: () => gatewayClient.get<SecurityRule[]>('/monitoring/rules'),
  createRule: (input: { name: string; description?: string; rule_type: string; threshold?: number; window_minutes?: number; action?: 'ALERT' | 'BLOCK' }) => gatewayClient.post<SecurityRule>('/monitoring/rules', input),
  toggleRule: (id: string, enabled: boolean) => gatewayClient.put<SecurityRule>(`/monitoring/rules/${encodeURIComponent(id)}/toggle`, { enabled }),
};
