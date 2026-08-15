import { gatewayClient } from './client';
import type { TokenPair } from '@/types/auth';

export const authApi = {
  login: (email: string, password: string) => gatewayClient.post<TokenPair>('/auth/login', { email, password }),
  register: (email: string, password: string) => gatewayClient.post<{ id: string; email: string; role: string; email_verified: boolean }>('/auth/register', { email, password }),
  verifyEmail: (email: string, code: string) => gatewayClient.post<{ verified: boolean }>('/auth/verify-email', { email, code }),
  resendOtp: (email: string) => gatewayClient.post<{ sent: boolean }>('/auth/resend-otp', { email }),
  logout: (refreshToken: string) => gatewayClient.post<void>('/auth/logout', { refresh_token: refreshToken }),
};
