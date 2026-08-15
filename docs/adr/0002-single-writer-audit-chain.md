# The audit chain has exactly one writer

Audit events are chained with `current_hash = SHA-256(canonical_payload + previous_hash)`,
which is only correct if appends are strictly serialized — a concurrent consumer would
read the same `previous_hash` twice and fork the chain, silently, with verification
failing only much later. So `audit-log-service` consumes with `prefetch=1` at a single
replica, and every append runs in one transaction that takes a lock on the chain-head
row. Within that same transaction it checks a unique index on `event_id` and no-ops if
the event is already present, so RabbitMQ redelivery cannot fork the chain or leave a
gap.

## Consequences

- Audit ingest cannot be scaled horizontally. This is a deliberate ceiling: tamper-evidence
  is worth more here than write throughput, and audit volume is far from the bottleneck.
- The dedupe check must never be moved out of the append transaction — a Redis or
  application-level dedupe would let a crash between dedupe and append drop or double an
  event. If someone later "optimizes" this, the chain quietly stops meaning anything.
- Verification is a single linear walk from the genesis row, which keeps the Phase 3
  tamper-detection test simple.
