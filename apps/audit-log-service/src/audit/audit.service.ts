import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';

/**
 * Audit Log Service append operation (V3 §5.7, ADR-0002).
 *
 * Single-writer, hash-chained, append-only audit log.
 * - One serialized writer (prefetch=1 when consuming RabbitMQ in Phase 2)
 * - PostgreSQL transaction with locked ChainHead row
 * - event_id deduplication inside the locked transaction
 * - SHA-256 hash chain: current_hash = SHA-256(canonical_payload + previous_hash)
 * - Commit transaction before acknowledging message
 *
 * Phase 1 baseline: logic in place; actual database calls deferred to when PrismaClient is wired.
 */
@Injectable()
export class AuditService {
  /**
   * Append an event to the hash chain.
   *
   * Pseudocode for Phase 2 database integration:
   * BEGIN TRANSACTION
   *   SELECT last_hash, last_event_id FROM chain_head FOR UPDATE (locked)
   *   IF event.event_id already in AuditEvent THEN
   *     ROLLBACK, return existing event
   *   END IF
   *   current_hash = SHA256(canonical_payload + last_hash)
   *   INSERT AuditEvent(id, hash, previous_hash, ...) VALUES(event_id, current_hash, last_hash, ...)
   *   UPDATE chain_head SET last_hash = current_hash, last_event_id = event.event_id
   * COMMIT
   * RETURN current_hash
   *
   * This ensures:
   * - Redelivered events (same event_id) are deduplicated inside the transaction
   * - Concurrent appends serialize (chain_head lock)
   * - Hash chain cannot fork (one writer at a time)
   */
  async appendEvent(event: {
    event_id: string;
    event_type: string;
    occurred_at: string;
    actor_id: string | null;
    resource_type: string;
    resource_id: string;
    payload: Record<string, unknown>;
  }): Promise<{ current_hash: string; sequence_number: number }> {
    // Phase 1 scaffold: return mock hash
    // Phase 2: implement full transaction logic above

    const canonicalPayload = JSON.stringify({
      event_id: event.event_id,
      event_type: event.event_type,
      occurred_at: event.occurred_at,
      actor_id: event.actor_id,
      resource_type: event.resource_type,
      resource_id: event.resource_id,
      payload: event.payload,
    });

    const previousHash = ''; // Phase 2: fetch from chain_head
    const currentHash = createHash('sha256')
      .update(canonicalPayload + previousHash)
      .digest('hex');

    return { current_hash: currentHash, sequence_number: 1 };
  }

  /**
   * Get the current chain head (for verification and recovery).
   */
  async getChainHead(): Promise<{ last_hash: string; last_event_id: string | null; sequence: number }> {
    // Phase 1: return empty chain
    // Phase 2: SELECT from chain_head
    return { last_hash: '', last_event_id: null, sequence: 0 };
  }

  /**
   * Canonical JSON serialization for hash chain.
   * Must be deterministic so the same event always produces the same hash.
   */
  private canonicalJSON(obj: Record<string, unknown>): string {
    // Sort keys to ensure determinism
    const sorted = Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = obj[key];
        return acc;
      }, {} as Record<string, unknown>);
    return JSON.stringify(sorted);
  }
}
