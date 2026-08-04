import type { Role, SessionRecord, TokenPair } from '@/types/auth';

const SESSION_KEY = 'c17.web.session.v1';

function tokenClaims(accessToken: string): { role: Role | null; userId: string | null } {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return { role: null, userId: null };
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown };
    return { role: decoded.role === 'ADMIN' || decoded.role === 'EMPLOYEE' ? decoded.role : null, userId: typeof (decoded as { sub?: unknown }).sub === 'string' ? (decoded as { sub: string }).sub : null };
  } catch { return { role: null, userId: null }; }
}

export function readSession(): SessionRecord | null {
  if (typeof window === 'undefined') return null;
  try { const raw = window.sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) as SessionRecord : null; } catch { return null; }
}

export function writeSession(tokens: TokenPair): SessionRecord {
  const claims = tokenClaims(tokens.access_token);
  const session: SessionRecord = { ...tokens, ...claims, expiresAt: Date.now() + tokens.expires_in_seconds * 1000 };
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearSession(): void { if (typeof window !== 'undefined') window.sessionStorage.removeItem(SESSION_KEY); }
