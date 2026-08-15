import { CAPABILITIES, Capability, isContentAdjacentCapability } from './capabilities';

describe('capabilities', () => {
  it('defines exactly the three capabilities of V3 §5.2.2', () => {
    expect([...CAPABILITIES].sort()).toEqual(
      ['ARCHIVE_RECEIVE', 'ARCHIVE_SUBMIT', 'DISPOSAL_APPROVE'].sort(),
    );
  });

  // ADR-0004: an ADMIN can never hold a content-adjacent capability, because ADMIN is the role
  // that grants capabilities. Every capability defined so far is content-adjacent.
  it.each(CAPABILITIES)('treats %s as content-adjacent', (capability) => {
    expect(isContentAdjacentCapability(capability)).toBe(true);
  });

  it('treats ARCHIVE_RECEIVE as content-adjacent, since its holder is the Archivist', () => {
    expect(isContentAdjacentCapability(Capability.ARCHIVE_RECEIVE)).toBe(true);
  });
});
