import { buildEventEnvelope, type EventEnvelope } from '@c17/contracts';

/**
 * Deterministic UUIDs for tests. `testUuid(1)` is stable across runs, so a failing assertion names
 * a recognisable id rather than a fresh random one.
 */
export function testUuid(seed: number): string {
  const hex = seed.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

export const FIXED_NOW = '2026-07-01T00:00:00.000Z';

export function anEventEnvelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    ...buildEventEnvelope({
      event_id: testUuid(1),
      event_type: 'test.event.happened',
      occurred_at: FIXED_NOW,
      producer: 'permission-service',
      correlation_id: testUuid(2),
      actor_id: testUuid(3),
      resource_type: 'test_resource',
      resource_id: testUuid(4),
      payload: {},
    }),
    ...overrides,
  };
}
