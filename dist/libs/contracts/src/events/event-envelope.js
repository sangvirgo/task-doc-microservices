"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventEnvelopeSchema = void 0;
exports.buildEventEnvelope = buildEventEnvelope;
const zod_1 = require("zod");
exports.eventEnvelopeSchema = zod_1.z
    .object({
    event_id: zod_1.z.string().uuid(),
    event_type: zod_1.z.string().min(1),
    occurred_at: zod_1.z.string().datetime(),
    producer: zod_1.z.string().min(1),
    correlation_id: zod_1.z.string().uuid(),
    actor_id: zod_1.z.string().uuid().nullable(),
    resource_type: zod_1.z.string().min(1),
    resource_id: zod_1.z.string().min(1),
    schema_version: zod_1.z.number().int().positive(),
    payload: zod_1.z.record(zod_1.z.unknown()),
})
    .strict();
function buildEventEnvelope(input) {
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
//# sourceMappingURL=event-envelope.js.map