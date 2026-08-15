import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client-audit';
import {
  createPaginationMeta,
  PaginatedResponse,
  PaginationQuery,
  toPrismaPagination,
} from '@c17/contracts';

import { AuditPrismaService } from '../prisma/audit-prisma.service';

export interface AuditEventDto {
  id: string;
  event_type: string;
  occurred_at: string;
  actor_id: string | null;
  resource_type: string;
  resource_id: string;
  payload: Record<string, unknown>;
  previous_hash: string;
  current_hash: string;
  sequence_number: number;
  created_at: string;
}

const DEFAULT_PAGINATION: PaginationQuery = { page: 1, page_size: 20 };

/**
 * Audit Log Service append operation (V3 §5.7, ADR-0002).
 *
 * Single-writer, hash-chained, append-only audit log.
 * - PostgreSQL transaction with locked ChainHead row
 * - event_id deduplication inside the locked transaction
 * - SHA-256 hash chain: current_hash = SHA-256(canonical_payload + previous_hash)
 * - Commit transaction before acknowledging message
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: AuditPrismaService) {}

  async appendEvent(event: {
    event_id: string;
    event_type: string;
    occurred_at: string;
    actor_id: string | null;
    resource_type: string;
    resource_id: string;
    payload: Record<string, unknown>;
  }): Promise<{ current_hash: string; sequence_number: number }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.auditEvent.findUnique({ where: { id: event.event_id } });
      if (existing) {
        return {
          current_hash: existing.current_hash,
          sequence_number: existing.sequence_number,
        };
      }

      // Ensure chain head row exists (first run), then lock it so concurrent
      // appends serialize and cannot observe the same sequence (V3 §5.7, ADR-0002).
      await tx.chainHead.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton', last_hash: '', sequence: 0 },
        update: {},
      });
      await tx.$queryRaw`SELECT "id" FROM "ChainHead" WHERE "id" = 'singleton' FOR UPDATE`;

      // Derive the chain base from the actual latest audit event so the sequence and
      // hash chain stay contiguous even if ChainHead drifted out of sync with the log.
      const latest = await tx.auditEvent.findFirst({
        orderBy: [{ sequence_number: 'desc' }, { id: 'desc' }],
      });
      const previousHash = latest?.current_hash ?? '';
      const sequenceNumber = (latest?.sequence_number ?? 0) + 1;

      const canonicalPayload = this.canonicalJSON({
        event_id: event.event_id,
        event_type: event.event_type,
        occurred_at: event.occurred_at,
        actor_id: event.actor_id,
        resource_type: event.resource_type,
        resource_id: event.resource_id,
        payload: event.payload,
      });

      const currentHash = createHash('sha256')
        .update(canonicalPayload + previousHash)
        .digest('hex');

      await tx.auditEvent.create({
        data: {
          id: event.event_id,
          event_type: event.event_type,
          occurred_at: new Date(event.occurred_at),
          actor_id: event.actor_id,
          resource_type: event.resource_type,
          resource_id: event.resource_id,
          payload: event.payload as Prisma.InputJsonValue,
          previous_hash: previousHash,
          current_hash: currentHash,
          sequence_number: sequenceNumber,
        },
      });

      await tx.chainHead.update({
        where: { id: 'singleton' },
        data: {
          last_hash: currentHash,
          last_event_id: event.event_id,
          sequence: sequenceNumber,
        },
      });

      return { current_hash: currentHash, sequence_number: sequenceNumber };
    });
  }

  async getChainHead(): Promise<{
    last_hash: string;
    last_event_id: string | null;
    sequence: number;
  }> {
    const head = await this.prisma.chainHead.findUnique({ where: { id: 'singleton' } });
    if (!head) {
      return { last_hash: '', last_event_id: null, sequence: 0 };
    }
    return {
      last_hash: head.last_hash,
      last_event_id: head.last_event_id,
      sequence: head.sequence,
    };
  }

  async getEvent(eventId: string): Promise<AuditEventDto | null> {
    const event = await this.prisma.auditEvent.findUnique({ where: { id: eventId } });
    if (!event) return null;
    return this.toDto(event);
  }

  async listEvents(
    filters?: {
      event_type?: string;
      actor_id?: string;
      resource_type?: string;
      resource_id?: string;
    },
    pagination: PaginationQuery = DEFAULT_PAGINATION,
  ): Promise<PaginatedResponse<AuditEventDto>> {
    const where = {
      event_type: filters?.event_type,
      actor_id: filters?.actor_id,
      resource_type: filters?.resource_type,
      resource_id: filters?.resource_id,
    };
    const [total, events] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        orderBy: [{ sequence_number: 'desc' }, { id: 'desc' }],
        ...toPrismaPagination(pagination),
      }),
    ]);
    return {
      items: events.map((e) => this.toDto(e)),
      pagination: createPaginationMeta(pagination.page, pagination.page_size, total),
    };
  }

  async verifyChainIntegrity(): Promise<{ valid: boolean; broken_at?: number }> {
    const events = await this.prisma.auditEvent.findMany({
      orderBy: { sequence_number: 'asc' },
    });

    if (events.length === 0) return { valid: true };

    let previousHash = '';
    for (const event of events) {
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
        return { valid: false, broken_at: event.sequence_number };
      }

      previousHash = event.current_hash;
    }

    return { valid: true };
  }

  private canonicalJSON(obj: Record<string, unknown>): string {
    return JSON.stringify(sortCanonical(obj));
  }

  private toDto(event: {
    id: string;
    event_type: string;
    occurred_at: Date;
    actor_id: string | null;
    resource_type: string;
    resource_id: string;
    payload: unknown;
    previous_hash: string;
    current_hash: string;
    sequence_number: number;
    created_at: Date;
  }): AuditEventDto {
    return {
      id: event.id,
      event_type: event.event_type,
      occurred_at: event.occurred_at.toISOString(),
      actor_id: event.actor_id,
      resource_type: event.resource_type,
      resource_id: event.resource_id,
      payload: event.payload as Record<string, unknown>,
      previous_hash: event.previous_hash,
      current_hash: event.current_hash,
      sequence_number: event.sequence_number,
      created_at: event.created_at.toISOString(),
    };
  }
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortCanonical(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = sortCanonical((value as Record<string, unknown>)[key]);
          return acc;
        },
        {} as Record<string, unknown>,
      );
  }

  return value;
}
