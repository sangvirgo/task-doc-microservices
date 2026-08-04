export type Role = 'ADMIN' | 'EMPLOYEE';

export interface TokenPair { access_token: string; refresh_token: string; expires_in_seconds: number; }
export interface SessionRecord extends TokenPair { role: Role | null; userId: string | null; expiresAt: number; }
