import { gatewayClient } from './client';
import type { TokenPair } from '@/types/auth';

export const authApi = {
  login: (email: string, password: string) => gatewayClient.post<TokenPair>('/auth/login', { email, password }),
  register: (email: string, password: string) => gatewayClient.post<{ id: string; email: string; role: string }>('/auth/register', { email, password }),
  logout: (refreshToken: string) => gatewayClient.post<void>('/auth/logout', { refresh_token: refreshToken }),
};
