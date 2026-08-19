import { gatewayClient } from './client';
import type { ManagedUser, MemberOption, SecurityAlert, SecurityRule } from '@/types/admin';

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

const ALL_USERS_CACHE_TTL_MS = 60_000;
let allUsersCache: { items: Array<{ id: string; email: string }>; expiresAt: number } | null = null;
let allUsersRequest: Promise<Array<{ id: string; email: string }>> | null = null;

const loadAllUsers = async () => {
  const users: Array<{ id: string; email: string }> = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await gatewayClient.get<DirectoryPage | Array<{ id: string; email: string }>>(`/users?page=${page}&page_size=100`);
    if (Array.isArray(response)) return sortMembers(response);
    users.push(...response.items);
    if (!response.pagination.has_next) break;
  }
  return sortMembers(users);
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
  allUsers: () => {
    const now = Date.now();
    if (allUsersCache && allUsersCache.expiresAt > now) return Promise.resolve(allUsersCache.items);
    if (allUsersRequest) return allUsersRequest;

    const request = loadAllUsers()
      .then(items => {
        allUsersCache = { items, expiresAt: Date.now() + ALL_USERS_CACHE_TTL_MS };
        return items;
      })
      .finally(() => {
        if (allUsersRequest === request) allUsersRequest = null;
      });
    allUsersRequest = request;
    return request;
  },
  users: () => gatewayClient.getList<ManagedUser>('/users'),
  user: (id: string) => gatewayClient.get<ManagedUser>(`/users/${encodeURIComponent(id)}`),
  createUser: (input: Pick<ManagedUser, 'id' | 'email' | 'role'>) => gatewayClient.post<ManagedUser>('/users', input),
  adminRegister: (email: string, password: string, role: 'ADMIN' | 'EMPLOYEE' = 'EMPLOYEE') =>
    gatewayClient.post<{ id: string; email: string; role: string; email_verified: boolean }>('/auth/admin/register', { email, password, role }),
  lock: (id: string) => gatewayClient.post<ManagedUser>(`/users/${encodeURIComponent(id)}/lock`),
  unlock: (id: string) => gatewayClient.post<ManagedUser>(`/users/${encodeURIComponent(id)}/unlock`),
  alerts: () => gatewayClient.getList<SecurityAlert>('/monitoring/alerts'),
  resolveAlert: (id: string, resolved_by: string) => gatewayClient.post<SecurityAlert>(`/monitoring/alerts/${encodeURIComponent(id)}/resolve`, { resolved_by }),
  rules: () => gatewayClient.getList<SecurityRule>('/monitoring/rules'),
  createRule: (input: { name: string; description?: string; rule_type: string; threshold?: number; window_minutes?: number; action?: 'ALERT' | 'BLOCK'; send_alert_email?: boolean }) => gatewayClient.post<SecurityRule>('/monitoring/rules', input),
  toggleRule: (id: string, enabled: boolean) => gatewayClient.put<SecurityRule>(`/monitoring/rules/${encodeURIComponent(id)}/toggle`, { enabled }),
  setRuleEmail: (id: string, send_alert_email: boolean) => gatewayClient.put<SecurityRule>(`/monitoring/rules/${encodeURIComponent(id)}/email`, { send_alert_email }),
  deleteRule: (id: string) => gatewayClient.delete<void>('/monitoring/rules/' + encodeURIComponent(id)),
};
