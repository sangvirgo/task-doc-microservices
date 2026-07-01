import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

/**
 * In-memory audit event store for Phase 1.
 * Phase 2 will replace with PostgreSQL via PrismaClient.
 */
interface AuditEventRecord {
  id: string;
  event_type: string;
  occurred_at: Date;
  actor_id: string | null;
  resource_type: string;
  resource_id: string;
  payload: Record<string, unknown>;
  previous_hash: string;
  current_hash: string;
  sequence_number: number;
  created_at: Date;
}

/**
 * Audit Log Service append operation (V3 §5.7, ADR-0002).
 *
 * Single-writer, hash-chained, append-only audit log.
 * - One serialized writer (prefetch=1 when consuming RabbitMQ in Phase 2)
 * - PostgreSQL transaction with locked ChainHead row (Phase 2)
 * - event_id deduplication inside the locked transaction
 * - SHA-256 hash chain: current_hash = SHA-256(canonical_payload + previous_hash)
 * - Commit transaction before acknowledging message
 *
 * Phase 1 implementation: in-memory store with proper hash-chain logic.
 * Phase 2: Replace with PostgreSQL PrismaClient while keeping the same interface.
 */
@Injectable()
export class AuditService {
  private chainHead = { lastHash: '', lastEventId: null as string | null, sequence: 0 };
  private events = new Map<string, AuditEventRecord>();

  /**
   * Append an event to the hash chain (V3 §5.7.2).
   *
   * Critical (ADR-0002): Deduplication check inside the locked append transaction.
   * This ensures RabbitMQ redelivery cannot fork the chain or leave a gap.
   *
   * Implementation:
   * 1. Check if event_id already exists (idempotency)
   * 2. Calculate canonical payload for hash determinism
   * 3. Compute current_hash = SHA-256(canonical_payload + previous_hash)
   * 4. Append event
   * 5. Update chain head
   * 6. Return result
   */
  appendEvent(event: {
    event_id: string;
    event_type: string;
    occurred_at: string;
    actor_id: string | null;
    resource_type: string;
    resource_id: string;
    payload: Record<string, unknown>;
  }): { current_hash: string; sequence_number: number } {
    // Step 1: Check if already appended (inside "transaction" lock in Phase 1)
    if (this.events.has(event.event_id)) {
      const existing = this.events.get(event.event_id)!;
      return {
        current_hash: existing.current_hash,
        sequence_number: existing.sequence_number,
      };
    }

    // Step 2: Deterministic canonical JSON with sorted keys
    const canonicalPayload = this.canonicalJSON({
      event_id: event.event_id,
      event_type: event.event_type,
      occurred_at: event.occurred_at,
      actor_id: event.actor_id,
      resource_type: event.resource_type,
      resource_id: event.resource_id,
      payload: event.payload,
    });

    // Step 3: Compute hash chain (V3 §5.7)
    const currentHash = createHash('sha256')
      .update(canonicalPayload + this.chainHead.lastHash)
      .digest('hex');

    // Step 4-5: Append event and update chain head (atomically in Phase 2)
    const sequenceNumber = this.chainHead.sequence + 1;
    const auditEvent: AuditEventRecord = {
      id: event.event_id,
      event_type: event.event_type,
      occurred_at: new Date(event.occurred_at),
      actor_id: event.actor_id,
      resource_type: event.resource_type,
      resource_id: event.resource_id,
      payload: event.payload,
      previous_hash: this.chainHead.lastHash,
      current_hash: currentHash,
      sequence_number: sequenceNumber,
      created_at: new Date(),
    };

    this.events.set(event.event_id, auditEvent);
    this.chainHead.lastHash = currentHash;
    this.chainHead.lastEventId = event.event_id;
    this.chainHead.sequence = sequenceNumber;

    return { current_hash: currentHash, sequence_number: sequenceNumber };
  }

  /**
   * Get the current chain head (for verification and recovery).
   */
  getChainHead(): {
    last_hash: string;
    last_event_id: string | null;
    sequence: number;
  } {
    return {
      last_hash: this.chainHead.lastHash,
      last_event_id: this.chainHead.lastEventId,
      sequence: this.chainHead.sequence,
    };
  }

  /**
   * Get a specific audit event (for verification).
   */
  getEvent(eventId: string): AuditEventRecord | undefined {
    return this.events.get(eventId);
  }

  /**
   * Verify the hash chain integrity (Phase 3 security monitoring).
   * Walk from genesis, recompute each hash, and detect tampering.
   */
  verifyChainIntegrity(): boolean {
    if (this.events.size === 0) {
      return true; // Empty chain is valid
    }

    // Phase 1: basic linear walk (Phase 3 will add comprehensive verification)
    let previousHash = '';
    for (const event of Array.from(this.events.values()).sort(
      (a, b) => a.sequence_number - b.sequence_number,
    )) {
      const recomputedHash = createHash('sha256')
        .update(
          this.canonicalJSON({
            event_id: event.id,
            event_type: event.event_type,
            occurred_at: event.occurred_at.toISOString(),
            actor_id: event.actor_id,
            resource_type: event.resource_type,
            resource_id: event.resource_id,
            payload: event.payload,
          }) + previousHash,
        )
        .digest('hex');

      if (recomputedHash !== event.current_hash) {
        return false; // Tampering detected
      }

      previousHash = event.current_hash;
    }

    return true;
  }

  /**
   * Canonical JSON serialization for hash chain.
   * Must be deterministic so the same event always produces the same hash.
   * This ensures verification walkers recompute the same hashes.
   */
  private canonicalJSON(obj: Record<string, unknown>): string {
    // Sort keys to ensure determinism
    const sorted = Object.keys(obj)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = obj[key];
          return acc;
        },
        {} as Record<string, unknown>,
      );
    return JSON.stringify(sorted);
  }
}
