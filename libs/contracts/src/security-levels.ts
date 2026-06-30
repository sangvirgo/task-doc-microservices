/**
 * A Document's internal classification (V3 §5.4).
 *
 * State-secret material has no level: it is rejected at upload and never becomes a Document
 * (V3 §5.4.1), so there is deliberately no STATE_SECRET member here.
 */
export const SecurityLevel = {
  PUBLIC: 'PUBLIC',
  INTERNAL: 'INTERNAL',
  CONFIDENTIAL: 'CONFIDENTIAL',
  RESTRICTED: 'RESTRICTED',
} as const;

export type SecurityLevel = (typeof SecurityLevel)[keyof typeof SecurityLevel];

export const SECURITY_LEVELS: readonly SecurityLevel[] = Object.values(SecurityLevel);
