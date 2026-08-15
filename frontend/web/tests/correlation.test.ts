import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCorrelationId } from '@/lib/correlation';

describe('createCorrelationId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the platform UUID generator when available', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });
    expect(createCorrelationId()).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('falls back to a UUID-shaped value in insecure browser contexts', () => {
    vi.stubGlobal('crypto', {});
    expect(createCorrelationId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});