import { gatewayClient } from './client';
import type { ManagedUser, MemberOption, SecurityAlert, SecurityRule } from '@/types/admin';
import type { Capability } from '@/types/capability';

type DirectoryPage = { items: MemberOption[]; pagination: { page: number; has_next: boolean } };
type DirectoryOptions = { force?: boolean };

const DIRECTORY_CACHE_TTL_MS = 60_000;
let directoryCache: { items: MemberOption[]; expiresAt: number } | null = null;
let directoryRequest: Promise<MemberOption[]> | null = null;

const sortMembers = (members: MemberOption[]) => Array.from(new Map(members.map(member => [member.id, member])).values())
  .sort((a, b) => a.email.localeCompare(b.email));

const loadDirectory = async () => {
  const members: MemberOption[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await gatewayClient.get<DirectoryPage | MemberOption[]>(`/users/directory?page=${page}&page_size=100`);
    if (Array.isArray(response)) return sortMembers(response);
    members.push(...response.items);
    if (!response.pagination.has_next) break;
  }
  return sortMembers(members);
};

const invalidateDirectory = () => {
  directoryCache = null;
};

export const adminApi = {
  directory: (options: DirectoryOptions = {}) => {
    const now = Date.now();
    if (!options.force && directoryCache && directoryCache.expiresAt > now) return Promise.resolve(directoryCache.items);
    if (directoryRequest) return directoryRequest;

    const request = loadDirectory()
      .then(items => {
        directoryCache = { items, expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS };
        return items;
      })
      .finally(() => {
        if (directoryRequest === request) directoryRequest = null;
      });
    directoryRequest = request;
    return request;
  },
  invalidateDirectory,
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
