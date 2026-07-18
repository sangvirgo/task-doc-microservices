import { anEventEnvelope } from '@c17/testing';

import { buildEventEnvelope, eventEnvelopeSchema } from './event-envelope';

describe('event envelope', () => {
  it('accepts the envelope of V3 §8.2', () => {
    expect(eventEnvelopeSchema.safeParse(anEventEnvelope()).success).toBe(true);
  });

  it('defaults schema_version to 1', () => {
    const envelope = buildEventEnvelope({
      event_id: '11111111-1111-4111-8111-111111111111',
      event_type: 'permission.grant.expired',
      occurred_at: '2026-07-01T00:00:00.000Z',
      producer: 'permission-service',
      correlation_id: '22222222-2222-4222-8222-222222222222',
      actor_id: null,
      resource_type: 'permission_grant',
      resource_id: '33333333-3333-4333-8333-333333333333',
      payload: {},
    });

    expect(envelope.schema_version).toBe(1);
  });

  it('rejects an envelope carrying an undeclared field', () => {
    const result = eventEnvelopeSchema.safeParse({ ...anEventEnvelope(), tenant: 'acme' });

    expect(result.success).toBe(false);
  });

  it('requires a correlation id, so a published event is always traceable', () => {
    const { correlation_id: _omitted, ...withoutCorrelationId } = anEventEnvelope();

    expect(eventEnvelopeSchema.safeParse(withoutCorrelationId).success).toBe(false);
  });
});
