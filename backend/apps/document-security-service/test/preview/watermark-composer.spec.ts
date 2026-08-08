import { composeWatermark } from '../../src/security/preview/watermark-composer';

describe('composeWatermark', () => {
  it('creates attributable multi-layer watermark content', () => {
    const input = {
      actorLabel: 'alice@example.test',
      documentId: 'doc-1',
      version: 2,
      sessionId: 'session-1',
      renderedAt: new Date('2026-08-08T10:00:00.000Z'),
      page: 3,
    };
    const result = composeWatermark(input);

    expect(result.text).toContain('PREVIEW ONLY');
    expect(result.text).toContain('alice@example.test');
    expect(result.text).toContain('doc-1');
    expect(result.text).toContain('v2');
    expect(result.text).toContain('session-1');
    expect(result.seed).not.toBe(composeWatermark({ ...input, page: 4 }).seed);
  });
});
