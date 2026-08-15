import { z } from 'zod';

/**
 * The RabbitMQ event envelope (V3 §8.2). Every published event uses exactly this shape.
 *
 * `payload` must never carry raw document content or comment content.
 */
export const eventEnvelopeSchema = z
  .object({
    event_id: z.string().uuid(),
    event_type: z.string().min(1),
    occurred_at: z.string().datetime(),
    producer: z.string().min(1),
    correlation_id: z.string().uuid(),
    actor_id: z.string().uuid().nullable(),
    resource_type: z.string().min(1),
    resource_id: z.string().min(1),
    schema_version: z.number().int().positive(),
    payload: z.record(z.unknown()),
  })
  .strict();

export type EventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> =
  Omit<z.infer<typeof eventEnvelopeSchema>, 'payload'> & { payload: TPayload };

export interface BuildEnvelopeInput<TPayload extends Record<string, unknown>> {
  event_id: string;
  event_type: string;
  occurred_at: string;
  producer: string;
  correlation_id: string;
  actor_id: string | null;
  resource_type: string;
  resource_id: string;
  payload: TPayload;
  schema_version?: number;
}

export function buildEventEnvelope<TPayload extends Record<string, unknown>>(
  input: BuildEnvelopeInput<TPayload>,
): EventEnvelope<TPayload> {
  return {
    event_id: input.event_id,
    event_type: input.event_type,
    occurred_at: input.occurred_at,
    producer: input.producer,
    correlation_id: input.correlation_id,
    actor_id: input.actor_id,
    resource_type: input.resource_type,
    resource_id: input.resource_id,
    schema_version: input.schema_version ?? 1,
    payload: input.payload,
  };
}
