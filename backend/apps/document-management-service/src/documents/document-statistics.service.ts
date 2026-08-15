import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isAdmin, type AuthContext } from '@c17/auth-context';
import { PermissionAction } from '@c17/contracts';
import { z } from 'zod';
import { randomUUID } from 'crypto';

import { DocumentPrismaService } from '../prisma/document-prisma.service';
import { PermissionClient } from '../permissions/permission.client';
import { TaskDocumentsService } from '../tasks/task-documents.service';

export interface DocumentStatisticsResult {
  visible_documents: number;
  task_documents: number;
  eligible_documents?: number;
}

export interface DocumentStatisticsInput {
  scope: 'ME' | 'ORGANIZATION';
  from: Date;
  toExclusive: Date;
  caller: AuthContext;
}

const internalQuerySchema = z
  .object({
    scope: z.enum(['ME', 'ORGANIZATION']),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export function parseDocumentStatisticsQuery(query: Record<string, unknown>): {
  scope: 'ME' | 'ORGANIZATION';
  from: Date;
  toExclusive: Date;
} {
  const parsed = internalQuerySchema.safeParse(query);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);

  const from = new Date(`${parsed.data.from}T00:00:00.000Z`);
  const toExclusive = new Date(`${parsed.data.to}T00:00:00.000Z`);
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(toExclusive.getTime()) ||
    from.toISOString().slice(0, 10) !== parsed.data.from ||
    toExclusive.toISOString().slice(0, 10) !== parsed.data.to
  ) {
    throw new BadRequestException('Invalid calendar date');
  }
  if (from > toExclusive) throw new BadRequestException('`to` must be on or after `from`');
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  if (toExclusive.getTime() - from.getTime() > 90 * 24 * 60 * 60 * 1000) {
    throw new BadRequestException('Date range cannot exceed 90 days');
  }

  return { scope: parsed.data.scope, from, toExclusive };
}

@Injectable()
export class DocumentStatisticsService {
  constructor(
    private readonly prisma: DocumentPrismaService,
    private readonly permissionClient: PermissionClient,
    private readonly taskDocumentsService: TaskDocumentsService,
  ) {}

  async getOverview(input: DocumentStatisticsInput): Promise<DocumentStatisticsResult> {
    if (input.scope === 'ORGANIZATION' && !isAdmin(input.caller)) {
      throw new ForbiddenException('Administrator role required');
    }

    const documents = await this.prisma.document.findMany({
      where: { created_at: { gte: input.from, lt: input.toExclusive } },
      select: { id: true, owner_id: true, creator_id: true },
    });

    const [directlyVisibleDocuments, taskDocumentStats] =
      input.scope === 'ORGANIZATION'
        ? [
            documents,
            {
              count: await this.countOrganizationTaskDocuments(input),
              documentIds: new Set<string>(),
            },
          ]
        : await Promise.all([
            this.findPreviewVisibleDocuments(documents, input.caller),
            this.findVisibleTaskDocuments(input),
          ]);
    const visibleDocumentIds = new Set(directlyVisibleDocuments.map((document) => document.id));
    for (const documentId of taskDocumentStats.documentIds) visibleDocumentIds.add(documentId);
    const result: DocumentStatisticsResult = {
      visible_documents: documents.filter((document) => visibleDocumentIds.has(document.id)).length,
      task_documents: taskDocumentStats.count,
    };

    if (input.scope === 'ORGANIZATION') {
      result.eligible_documents = await this.countEligibleDocuments(input);
    }

    return result;
  }

  private async findPreviewVisibleDocuments(
    documents: Array<{ id: string; owner_id: string; creator_id: string }>,
    caller: AuthContext,
  ) {
    const visible = [];
    for (const document of documents) {
      const decision = await this.permissionClient.check({
        actor_id: caller.userId,
        actor_role: caller.role,
        resource_type: 'DOCUMENT',
        resource_id: document.id,
        action: PermissionAction.PREVIEW,
        task_id: null,
        owner_id: document.owner_id,
        creator_id: document.creator_id,
        correlation_id: randomUUID(),
      });
      if (decision.reason_code === 'PERMISSION_SERVICE_UNAVAILABLE') {
        throw new ServiceUnavailableException('Permission service unavailable');
      }
      if (decision.allowed) visible.push(document);
    }
    return visible;
  }

  private async findVisibleTaskDocuments(
    input: DocumentStatisticsInput,
  ): Promise<{ count: number; documentIds: Set<string> }> {
    const associations = await this.prisma.taskDocument.findMany({
      where: { attached_at: { gte: input.from, lt: input.toExclusive } },
      select: { task_id: true },
      distinct: ['task_id'],
    });

    let visibleCount = 0;
    const documentIds = new Set<string>();
    for (const association of associations) {
      let page = 1;
      let hasNext = true;
      while (hasNext) {
        try {
          const result = await this.taskDocumentsService.list(association.task_id, input.caller, {
            page,
            page_size: 100,
          });
          visibleCount += result.items.filter((item) => {
            const attachedAt = new Date(item.attached_at).getTime();
            const inRange =
              attachedAt >= input.from.getTime() && attachedAt < input.toExclusive.getTime();
            if (inRange) documentIds.add(item.document_id);
            return inRange;
          }).length;
          hasNext = result.pagination.has_next;
          page += 1;
        } catch (error) {
          if (error instanceof ForbiddenException) {
            hasNext = false;
            continue;
          }
          throw error;
        }
      }
    }
    return { count: visibleCount, documentIds };
  }

  private async countOrganizationTaskDocuments(input: DocumentStatisticsInput): Promise<number> {
    const rows = await this.prisma.taskDocument.findMany({
      where: { attached_at: { gte: input.from, lt: input.toExclusive } },
      select: { id: true },
    });
    return rows.length;
  }

  private async countEligibleDocuments(input: DocumentStatisticsInput): Promise<number> {
    const candidates = await this.prisma.document.findMany({
      where: {
        created_at: { gte: input.from, lt: input.toExclusive },
        retention_expires_at: { lte: new Date() },
        archive_status: 'ARCHIVED',
        disposal_status: null,
      },
      select: { id: true },
    });
    if (candidates.length === 0) return 0;

    const holds = await this.prisma.retentionHold.findMany({
      where: { document_id: { in: candidates.map((document) => document.id) }, released_at: null },
      select: { document_id: true },
    });
    const heldIds = new Set(holds.map((hold) => hold.document_id));
    return candidates.filter((document) => !heldIds.has(document.id)).length;
  }
}
