/**
 * Denial reason codes (V3 §8.1). Every denial carries exactly one.
 */
export const PermissionReasonCode = {
  /** No grant exists for this actor on this resource. */
  NO_GRANT: 'NO_GRANT',
  /** A grant exists but its effective expiry has passed. */
  GRANT_EXPIRED: 'GRANT_EXPIRED',
  /** A grant exists but was revoked. */
  GRANT_REVOKED: 'GRANT_REVOKED',
  /** A delegated grant whose parent is expired, revoked, or missing. */
  PARENT_GRANT_INVALID: 'PARENT_GRANT_INVALID',
  /** The actor holds ADMIN and the action touches content, participation, or archive custody. */
  ADMIN_CONTENT_DENIED: 'ADMIN_CONTENT_DENIED',
  /** The actor is not a direct participant of the task. */
  NOT_A_PARTICIPANT: 'NOT_A_PARTICIPANT',
  /** The action requires a capability the actor does not hold. */
  MISSING_CAPABILITY: 'MISSING_CAPABILITY',
  /** The check could not be completed. Fail closed — this is a denial, never an allow. */
  PERMISSION_SERVICE_UNAVAILABLE: 'PERMISSION_SERVICE_UNAVAILABLE',
} as const;

export type PermissionReasonCode = (typeof PermissionReasonCode)[keyof typeof PermissionReasonCode];

export const PERMISSION_REASON_CODES: readonly PermissionReasonCode[] =
  Object.values(PermissionReasonCode);
