/**
 * Fine-grained rights held by an EMPLOYEE and administered by an ADMIN (V3 §5.2.2).
 *
 * A capability never substitutes for a Grant on a specific Document.
 */
export const Capability = {
  /** may submit a Transfer Package */
  ARCHIVE_SUBMIT: 'ARCHIVE_SUBMIT',
  /** may receive, accept, or reject a Transfer Package (the Archivist) */
  ARCHIVE_RECEIVE: 'ARCHIVE_RECEIVE',
  /** may approve a controlled disposal */
  DISPOSAL_APPROVE: 'DISPOSAL_APPROVE',
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

export const CAPABILITIES: readonly Capability[] = Object.values(Capability);

/**
 * Capabilities that confer content-adjacent authority. An ADMIN account can never hold one,
 * because ADMIN is the role that grants capabilities (V3 §5.2.2, ADR-0004).
 *
 * Every capability currently defined is content-adjacent. The set is kept explicit rather than
 * derived so that adding a non-content capability is a deliberate, reviewable act.
 */
export const CONTENT_ADJACENT_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  Capability.ARCHIVE_SUBMIT,
  Capability.ARCHIVE_RECEIVE,
  Capability.DISPOSAL_APPROVE,
]);

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

export function isContentAdjacentCapability(value: Capability): boolean {
  return CONTENT_ADJACENT_CAPABILITIES.has(value);
}
