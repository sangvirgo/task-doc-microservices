export const CAPABILITIES = ['ARCHIVE_SUBMIT', 'ARCHIVE_RECEIVE', 'DISPOSAL_APPROVE'] as const;

export type Capability = (typeof CAPABILITIES)[number];
