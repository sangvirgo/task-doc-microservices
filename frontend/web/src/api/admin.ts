import { gatewayClient } from './client';
import type { ManagedUser, MemberOption, SecurityAlert, SecurityRule } from '@/types/admin';
import type { Capability } from '@/types/capability';

type DirectoryPage = { items: MemberOption[]; pagination: { page: number; has_next: boolean } };

export const adminApi = {
  directory: async () => {
    const members: MemberOption[] = [];
    const refresh = Date.now();
    for (let page = 1; page <= 100; page += 1) {
      const response = await gatewayClient.get<DirectoryPage | MemberOption[]>(`/users/directory?page=${page}&page_size=100&refresh=${refresh}`);
      if (Array.isArray(response)) return response;
      members.push(...response.items);
      if (!response.pagination.has_next) break;
    }
    return Array.from(new Map(members.map(member => [member.id, member])).values()).sort((a, b) => a.email.localeCompare(b.email));
  },
  users: () => gatewayClient.getList<ManagedUser>('/users'),
  user: (id: string) => gatewayClient.get<ManagedUser>(`/users/${encodeURIComponent(id)}`),
  createUser: (input: Pick<ManagedUser, 'id' | 'email' | 'role'>) => gatewayClient.post<ManagedUser>('/users', input),
  lock: (id: string) => gatewayClient.post<ManagedUser>(`/users/${encodeURIComponent(id)}/lock`),
  unlock: (id: string) => gatewayClient.post<ManagedUser>(`/users/${encodeURIComponent(id)}/unlock`),
  grantCapability: (id: string, capability: Capability) => gatewayClient.post<ManagedUser>(`/users/${encodeURIComponent(id)}/capabilities`, { capability }),
  revokeCapability: (id: string, capability: Capability) => gatewayClient.delete<ManagedUser>(`/users/${encodeURIComponent(id)}/capabilities/${encodeURIComponent(capability)}`),
  alerts: () => gatewayClient.getList<SecurityAlert>('/monitoring/alerts'),
  resolveAlert: (id: string, resolved_by: string) => gatewayClient.post<SecurityAlert>(`/monitoring/alerts/${encodeURIComponent(id)}/resolve`, { resolved_by }),
  rules: () => gatewayClient.getList<SecurityRule>('/monitoring/rules'),
  createRule: (input: { name: string; description?: string; rule_type: string; threshold?: number; window_minutes?: number; action?: 'ALERT' | 'BLOCK' }) => gatewayClient.post<SecurityRule>('/monitoring/rules', input),
  toggleRule: (id: string, enabled: boolean) => gatewayClient.put<SecurityRule>(`/monitoring/rules/${encodeURIComponent(id)}/toggle`, { enabled }),
};
