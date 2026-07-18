import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

import {
  buildEventEnvelope,
  EventType,
  PermissionAction,
  PermissionReasonCode,
  Producer,
  ResourceType,
  isAdminForbiddenAction,
} from '@c17/contracts';
import { EVENT_PUBLISHER, type EventPublisher } from '@c17/messaging';
import { PermissionPrismaService } from '../prisma/permission-prisma.service';

export interface GrantDto {
  id: string;
  grantor_id: string;
  actor_id: string;
  resource_type: string;
  resource_id: string;
  permissions: string[];
  task_id: string;
  expires_at: string;
  effective_expires_at: string;
  status: string;
  revoked_at: string | null;
  parent_grant_id: string | null;
  created_at: string;
}

const TASK_PERMISSION_ACTIONS: ReadonlySet<PermissionAction> = new Set([
  PermissionAction.TASK_CREATE,
  PermissionAction.TASK_VIEW,
  PermissionAction.TASK_ASSIGN,
  PermissionAction.TASK_COMMENT,
  PermissionAction.TASK_SUBMIT,
  PermissionAction.TASK_REVIEW,
  PermissionAction.TASK_MODIFY,
]);

/**
 * Permission Service RBAC evaluation (V3 §8.1, ADR-0001).
 *
 * Implementation: Prisma-backed grant lookup, expiry checking, revocation checking, and ADMIN hard-deny.
 */
@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(
    private readonly prisma: PermissionPrismaService,
    @Optional() @Inject(EVENT_PUBLISHER) private readonly eventPublisher?: EventPublisher,
  ) {}

  /**
   * Check whether an actor has permission on a resource (V3 §8.1).
   *
   * Default deny, fail-closed:
   * - ADMIN hard-deny: ADMIN_CONTENT_DENIED (ADR-0004)
   * - No grant: NO_GRANT
   * - Grant revoked: GRANT_REVOKED
   * - Grant expired: GRANT_EXPIRED (checked against effective_expires_at)
   * - Action not in permissions: MISSING_CAPABILITY
   * - All other errors: PERMISSION_SERVICE_UNAVAILABLE
   */
  async check(request: {
    actor_id: string;
    actor_role: string;
    resource_type: string;
    resource_id: string;
    action: PermissionAction;
    task_id?: string | null;
  }): Promise<{
    allowed: boolean;
    reason_code: PermissionReasonCode | null;
    effective_expires_at: string | null;
  }> {
    try {
      // Step 1: V3 §5.2.1 ADMIN content hard-deny (ADR-0004)
      if (request.actor_role === 'ADMIN' && isAdminForbiddenAction(request.action)) {
        return {
          allowed: false,
          reason_code: PermissionReasonCode.ADMIN_CONTENT_DENIED,
          effective_expires_at: null,
        };
      }

      if (this.isTaskPermissionCheck(request.resource_type, request.action)) {
        return {
          allowed: true,
          reason_code: null,
          effective_expires_at: null,
        };
      }

      // Step 2: Look up active grant for actor + resource (V3 §5.5.2)
      const grant = await this.prisma.grant.findFirst({
        where: {
          actor_id: request.actor_id,
          resource_type: request.resource_type,
          resource_id: request.resource_id,
          revoked_at: null,
        },
        orderBy: { created_at: 'desc' },
      });

      if (!grant) {
        return {
          allowed: false,
          reason_code: PermissionReasonCode.NO_GRANT,
          effective_expires_at: null,
        };
      }

      if (grant.status === 'EXPIRED') {
        return {
          allowed: false,
          reason_code: PermissionReasonCode.GRANT_EXPIRED,
          effective_expires_at: grant.effective_expires_at.toISOString(),
        };
      }

      if (grant.status !== 'ACTIVE') {
        return {
          allowed: false,
          reason_code: PermissionReasonCode.NO_GRANT,
          effective_expires_at: null,
        };
      }

      // Step 3: Check expiration (V3 §5.5.2, ADR-0001)
      // effective_expires_at is denormalized; check it at request time
      const now = new Date();
      if (now > grant.effective_expires_at) {
        return {
          allowed: false,
          reason_code: PermissionReasonCode.GRANT_EXPIRED,
          effective_expires_at: grant.effective_expires_at.toISOString(),
        };
      }

      // Step 4: Check permission is in the grant's action set
      if (!grant.permissions.includes(request.action)) {
        return {
          allowed: false,
          reason_code: PermissionReasonCode.MISSING_CAPABILITY,
          effective_expires_at: grant.effective_expires_at.toISOString(),
        };
      }

      // Step 5: Grant is valid, allow access
      return {
        allowed: true,
        reason_code: null,
        effective_expires_at: grant.effective_expires_at.toISOString(),
      };
    } catch (error) {
      // Fail-closed on any error (V3 §5.5.3, ADR-0001)
      this.logger.error('Permission check error', error);
      return {
        allowed: false,
        reason_code: PermissionReasonCode.PERMISSION_SERVICE_UNAVAILABLE,
        effective_expires_at: null,
      };
    }
  }

  private isTaskPermissionCheck(resourceType: string, action: PermissionAction): boolean {
    return resourceType === ResourceType.TASK && TASK_PERMISSION_ACTIONS.has(action);
  }

  async createGrant(data: {
    grantor_id: string;
    actor_id: string;
    resource_type: string;
    resource_id: string;
    permissions: string[];
    task_id: string;
    expires_at: Date;
    effective_expires_at?: Date;
    parent_grant_id?: string;
  }): Promise<GrantDto> {
    const grant = await this.prisma.grant.create({
      data: {
        grantor_id: data.grantor_id,
        actor_id: data.actor_id,
        resource_type: data.resource_type,
        resource_id: data.resource_id,
        permissions: data.permissions,
        task_id: data.task_id,
        expires_at: data.expires_at,
        effective_expires_at: data.effective_expires_at || data.expires_at,
        status: 'ACTIVE',
        parent_grant_id: data.parent_grant_id || null,
      },
    });
    return this.toDto(grant);
  }

  async revokeGrant(grant_id: string, revocation_reason?: string): Promise<GrantDto> {
    const grant = await this.prisma.grant.findUnique({ where: { id: grant_id } });
    if (!grant) throw new NotFoundException('Grant not found');

    const revokedAt = grant.revoked_at ?? new Date();
    await this.cascadeRevoke([grant_id], revokedAt, revocation_reason || null);
    const updated = await this.prisma.grant.findUniqueOrThrow({ where: { id: grant_id } });
    return this.toDto(updated);
  }

  async getGrant(id: string): Promise<GrantDto> {
    const grant = await this.prisma.grant.findUnique({ where: { id } });
    if (!grant) throw new NotFoundException('Grant not found');
    return this.toDto(grant);
  }

  async listGrants(filters?: {
    actor_id?: string;
    resource_type?: string;
    resource_id?: string;
    status?: string;
    task_id?: string;
  }): Promise<GrantDto[]> {
    const grants = await this.prisma.grant.findMany({
      where: filters,
      orderBy: { created_at: 'desc' },
    });
    return grants.map((g) => this.toDto(g));
  }

  async delegateGrant(data: {
    parent_grant_id: string;
    actor_id: string;
    permissions?: string[];
  }): Promise<GrantDto> {
    const parent = await this.prisma.grant.findUnique({
      where: { id: data.parent_grant_id },
    });
    if (!parent) throw new NotFoundException('Parent grant not found');
    if (parent.status !== 'ACTIVE') throw new BadRequestException('Parent grant must be ACTIVE');
    if (parent.revoked_at) throw new BadRequestException('Parent grant is revoked');
    if (parent.effective_expires_at.getTime() <= Date.now()) {
      throw new BadRequestException('Parent grant is expired');
    }

    const delegatedPermissions = data.permissions || parent.permissions;
    for (const perm of delegatedPermissions) {
      if (!parent.permissions.includes(perm)) {
        throw new BadRequestException(`Cannot delegate permission not held by parent: ${perm}`);
      }
    }

    const delegated = await this.prisma.grant.create({
      data: {
        grantor_id: parent.grantor_id,
        actor_id: data.actor_id,
        resource_type: parent.resource_type,
        resource_id: parent.resource_id,
        permissions: delegatedPermissions,
        task_id: parent.task_id,
        expires_at: parent.expires_at,
        effective_expires_at: parent.effective_expires_at,
        status: 'ACTIVE',
        parent_grant_id: data.parent_grant_id,
      },
    });
    return this.toDto(delegated);
  }

  async expireDueGrants(now: Date = new Date()): Promise<number> {
    const dueGrants = await this.prisma.grant.findMany({
      where: {
        status: 'ACTIVE',
        revoked_at: null,
        effective_expires_at: { lte: now },
      },
      select: {
        id: true,
        actor_id: true,
        resource_type: true,
        resource_id: true,
        effective_expires_at: true,
      },
    });

    if (dueGrants.length === 0) {
      return 0;
    }

    const ids = dueGrants.map((grant) => grant.id);
    const result = await this.prisma.grant.updateMany({
      where: {
        id: { in: ids },
        status: 'ACTIVE',
        revoked_at: null,
      },
      data: {
        status: 'EXPIRED',
      },
    });

    for (const grant of dueGrants) {
      await this.eventPublisher?.publish(
        buildEventEnvelope({
          event_id: randomUUID(),
          event_type: EventType.PERMISSION_GRANT_EXPIRED,
          occurred_at: now.toISOString(),
          producer: Producer.PERMISSION_SERVICE,
          correlation_id: randomUUID(),
          actor_id: grant.actor_id,
          resource_type: grant.resource_type,
          resource_id: grant.resource_id,
          payload: {
            grant_id: grant.id,
            effective_expires_at: grant.effective_expires_at.toISOString(),
          },
        }),
      );
    }

    return result.count;
  }

  async handleTaskDeadlineChanged(task_id: string, deadline: Date): Promise<number> {
    const grants = await this.prisma.grant.findMany({
      where: {
        task_id,
        status: 'ACTIVE',
        revoked_at: null,
        effective_expires_at: { gt: deadline },
      },
      select: {
        id: true,
        expires_at: true,
        effective_expires_at: true,
      },
    });

    let updatedCount = 0;
    for (const grant of grants) {
      const nextEffectiveExpiry =
        grant.expires_at.getTime() < deadline.getTime() ? grant.expires_at : deadline;

      if (nextEffectiveExpiry.getTime() >= grant.effective_expires_at.getTime()) {
        continue;
      }

      await this.prisma.grant.update({
        where: { id: grant.id },
        data: { effective_expires_at: nextEffectiveExpiry },
      });
      updatedCount += 1;
    }

    return updatedCount;
  }

  private async cascadeRevoke(
    rootGrantIds: string[],
    revokedAt: Date,
    revocationReason: string | null,
  ): Promise<void> {
    const visited = new Set<string>();
    const pending = [...rootGrantIds];

    while (pending.length > 0) {
      const grantId = pending.shift();
      if (!grantId || visited.has(grantId)) {
        continue;
      }

      visited.add(grantId);

      const children = await this.prisma.grant.findMany({
        where: { parent_grant_id: grantId },
        select: { id: true },
      });

      pending.push(...children.map((child) => child.id));
    }

    await this.prisma.grant.updateMany({
      where: {
        id: { in: Array.from(visited) },
        status: { not: 'REVOKED' },
      },
      data: {
        status: 'REVOKED',
        revoked_at: revokedAt,
        revocation_reason: revocationReason,
      },
    });
  }

  private toDto(grant: {
    id: string;
    grantor_id: string;
    actor_id: string;
    resource_type: string;
    resource_id: string;
    permissions: string[];
    task_id: string;
    expires_at: Date;
    effective_expires_at: Date;
    status: string;
    revoked_at: Date | null;
    parent_grant_id: string | null;
    created_at: Date;
  }): GrantDto {
    return {
      id: grant.id,
      grantor_id: grant.grantor_id,
      actor_id: grant.actor_id,
      resource_type: grant.resource_type,
      resource_id: grant.resource_id,
      permissions: grant.permissions,
      task_id: grant.task_id,
      expires_at: grant.expires_at.toISOString(),
      effective_expires_at: grant.effective_expires_at.toISOString(),
      status: grant.status,
      revoked_at: grant.revoked_at?.toISOString() ?? null,
      parent_grant_id: grant.parent_grant_id,
      created_at: grant.created_at.toISOString(),
    };
  }
}
