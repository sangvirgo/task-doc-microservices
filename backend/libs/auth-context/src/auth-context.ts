import type { Capability, SystemRole } from '@c17/contracts';

/**
 * The authenticated caller, as resolved from a validated access token.
 *
 * It carries identity and administered rights only. It never carries a decision: whether this
 * caller may do something is answered by Permission Service (V3 §8.1), not by reading these
 * fields at the call site.
 */
export interface AuthContext {
  readonly userId: string;
  readonly role: SystemRole;
  readonly capabilities: readonly Capability[];
  readonly sessionId: string;
}

export function isAdmin(auth: AuthContext): boolean {
  return auth.role === 'ADMIN';
}

export function hasCapability(auth: AuthContext, capability: Capability): boolean {
  return auth.capabilities.includes(capability);
}
