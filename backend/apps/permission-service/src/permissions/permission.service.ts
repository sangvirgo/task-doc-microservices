import {
  BadRequestException,
  ForbiddenException,
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
  isPermissionAction,
  isAdminForbiddenAction,
  createPaginationMeta,
  PaginatedResponse,
  PaginationQuery,
  toPrismaPagination,
} from '@c17/contracts';
import { EVENT_PUBLISHER, type EventPublisher } from '@c17/messaging';
import { PermissionPrismaService } from '../prisma/permission-prisma.service';
import { TaskContextClient } from '../tasks/task-context.client';
import { TaskDocumentClient } from '../tasks/task-document.client';

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

const DEFAULT_PAGINATION: PaginationQuery = { page: 1, page_size: 20 };

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
    private readonly taskContextClient: TaskContextClient,
    private readonly taskDocumentClient: TaskDocumentClient,
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
    owner_id?: string;
    creator_id?: string;
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

      // Document owners and creators retain full control of their own content. This is an
      // implicit ownership right, so it also works for standalone documents without a task grant.
      if (
        request.resource_type === ResourceType.DOCUMENT &&
        (request.actor_id === request.owner_id || request.actor_id === request.creator_id)
      ) {
        return {
          allowed: true,
          reason_code: null,
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

      // Step 2: Look up grants for actor + resource (V3 §5.5.2). A document grant is
      // usable only while its task-document association remains present.
      const grants = await this.prisma.grant.findMany({
        where: {
          actor_id: request.actor_id,
          resource_type: request.resource_type,
          resource_id: request.resource_id,
          task_id: request.task_id ?? undefined,
          revoked_at: null,
        },
        orderBy: { created_at: 'desc' },
      });

      let expiredGrant: (typeof grants)[number] | undefined;
      let missingPermissionGrant: (typeof grants)[number] | undefined;

      for (const grant of grants) {
        if (
          grant.resource_type === ResourceType.DOCUMENT &&
          !(await this.taskDocumentClient.exists(grant.task_id, grant.resource_id))
        ) {
          continue;
        }

        if (grant.status === 'EXPIRED' || grant.effective_expires_at.getTime() <= Date.now()) {
          expiredGrant ??= grant;
          continue;
        }

        if (grant.status !== 'ACTIVE') continue;

        if (!grant.permissions.includes(request.action)) {
          missingPermissionGrant ??= grant;
          continue;
        }

        return {
          allowed: true,
          reason_code: null,
          effective_expires_at: grant.effective_expires_at.toISOString(),
        };
      }

      if (expiredGrant) {
        return {
          allowed: false,
          reason_code: PermissionReasonCode.GRANT_EXPIRED,
          effective_expires_at: expiredGrant.effective_expires_at.toISOString(),
        };
      }

      if (missingPermissionGrant) {
        return {
          allowed: false,
          reason_code: PermissionReasonCode.MISSING_CAPABILITY,
          effective_expires_at: missingPermissionGrant.effective_expires_at.toISOString(),
        };
      }

      return {
        allowed: false,
        reason_code: PermissionReasonCode.NO_GRANT,
        effective_expires_at: null,
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
    this.assertKnownPermissions(data.permissions);

    const taskContext = await this.taskContextClient.getContext(data.task_id);
    if (
      data.resource_type === ResourceType.DOCUMENT &&
      !(await this.taskDocumentClient.exists(data.task_id, data.resource_id))
    ) {
      throw new BadRequestException('A document grant requires a valid task-document association');
    }
    if (
      data.resource_type === ResourceType.DOCUMENT &&
      !isDirectTaskParticipant(taskContext, data.actor_id)
    ) {
      throw new ForbiddenException('Grant recipient must be a direct task participant');
    }

    const now = new Date();
    if (data.expires_at.getTime() <= now.getTime()) {
      throw new BadRequestException('Grant expiration must be in the future');
    }

    let parentEffectiveExpiry: Date | undefined;
    if (data.parent_grant_id) {
      const parent = await this.requireActiveParent(data.parent_grant_id, data);
      parentEffectiveExpiry = parent.effective_expires_at;
      this.assertPermissionSubset(data.permissions, parent.permissions);
    }

    const taskDeadline = taskContext.task.deadline
      ? new Date(taskContext.task.deadline)
      : undefined;
    const effectiveExpiresAt = earliestDate(data.expires_at, taskDeadline, parentEffectiveExpiry);
    if (effectiveExpiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException('Grant is already expired under the task or parent grant');
    }

    const grant = await this.prisma.grant.create({
      data: {
        grantor_id: data.grantor_id,
        actor_id: data.actor_id,
        resource_type: data.resource_type,
        resource_id: data.resource_id,
        permissions: data.permissions,
        task_id: data.task_id,
        expires_at: data.expires_at,
        effective_expires_at: effectiveExpiresAt,
        status: 'ACTIVE',
        parent_grant_id: data.parent_grant_id || null,
      },
    });
    return this.toDto(grant);
  }

  async createTaskScopedGrant(data: {
    grantor_id: string;
    actor_id: string;
    resource_id: string;
    permissions: string[];
    task_id: string;
    expires_at: Date;
    parent_grant_id?: string;
  }): Promise<GrantDto> {
    const context = await this.taskContextClient.getContext(data.task_id);
    if (!isDirectTaskParticipant(context, data.actor_id)) {
      throw new ForbiddenException('Grant recipient must be a direct task participant');
    }

    const existing = await this.prisma.grant.findFirst({
      where: {
        resource_type: ResourceType.DOCUMENT,
        resource_id: data.resource_id,
        task_id: data.task_id,
        actor_id: data.actor_id,
        status: 'ACTIVE',
      },
      orderBy: { created_at: 'desc' },
    });

    if (existing) {
      this.assertKnownPermissions(data.permissions);
      const now = new Date();
      if (data.expires_at.getTime() <= now.getTime()) {
        throw new BadRequestException('Grant expiration must be in the future');
      }
      const taskDeadline = context.task.deadline ? new Date(context.task.deadline) : undefined;
      const effectiveExpiresAt = earliestDate(data.expires_at, taskDeadline);
      if (effectiveExpiresAt.getTime() <= now.getTime()) {
        throw new BadRequestException('Grant is already expired under the task deadline');
      }
      const updated = await this.prisma.grant.update({
        where: { id: existing.id },
        data: {
          grantor_id: data.grantor_id,
          permissions: data.permissions,
          expires_at: data.expires_at,
          effective_expires_at: effectiveExpiresAt,
          status: 'ACTIVE',
          revoked_at: null,
        },
      });
      await this.shortenDescendantExpiries(existing.id, effectiveExpiresAt);
      return this.toDto(updated);
    }

    return this.createGrant({
      ...data,
      resource_type: ResourceType.DOCUMENT,
    });
  }

  async revokeTaskDocumentGrants(
    task_id: string,
    resource_id: string,
    revocation_reason: string,
  ): Promise<number> {
    const grants = await this.prisma.grant.findMany({
      where: { task_id, resource_type: ResourceType.DOCUMENT, resource_id },
      select: { id: true },
    });

    if (grants.length === 0) return 0;
    await this.cascadeRevoke(
      grants.map((grant) => grant.id),
      new Date(),
      revocation_reason,
    );
    return grants.length;
  }

  async listTaskDocumentGrants(
    task_id: string,
    resource_id: string,
    pagination: PaginationQuery = DEFAULT_PAGINATION,
  ): Promise<PaginatedResponse<GrantDto>> {
    if (!(await this.taskDocumentClient.exists(task_id, resource_id))) {
      throw new BadRequestException('A grant requires a valid task-document association');
    }
    return this.listGrants(
      { task_id, resource_type: ResourceType.DOCUMENT, resource_id },
      pagination,
    );
  }

  async updateTaskDocumentGrant(data: {
    grant_id: string;
    task_id: string;
    resource_id: string;
    permissions?: string[];
    expires_at?: Date;
    caller_id: string;
  }): Promise<GrantDto> {
    const grant = await this.prisma.grant.findUnique({ where: { id: data.grant_id } });
    if (!grant) throw new NotFoundException('Grant not found');
    this.assertTaskDocumentGrant(grant, data.task_id, data.resource_id);
    if (grant.grantor_id !== data.caller_id) {
      throw new ForbiddenException('Only the grantor may update this grant');
    }
    if (grant.status !== 'ACTIVE' || grant.revoked_at) {
      throw new BadRequestException('Only an ACTIVE grant may be updated');
    }
    if (!(await this.taskDocumentClient.exists(data.task_id, data.resource_id))) {
      throw new BadRequestException('A grant requires a valid task-document association');
    }

    const nextPermissions = data.permissions ?? grant.permissions;
    this.assertKnownPermissions(nextPermissions);
    if (data.expires_at && data.expires_at.getTime() <= Date.now()) {
      throw new BadRequestException('Grant expiration must be in the future');
    }

    const children = await this.prisma.grant.findMany({
      where: { parent_grant_id: data.grant_id },
      select: { id: true, permissions: true },
    });
    for (const child of children) {
      if (child.permissions.some((permission) => !nextPermissions.includes(permission))) {
        throw new BadRequestException(
          'Grant permissions cannot be reduced below a delegated child',
        );
      }
    }

    const taskContext = await this.taskContextClient.getContext(data.task_id);
    const parent = grant.parent_grant_id
      ? await this.prisma.grant.findUnique({ where: { id: grant.parent_grant_id } })
      : null;
    if (parent) {
      this.assertPermissionSubset(nextPermissions, parent.permissions);
    }
    const taskDeadline = taskContext.task.deadline
      ? new Date(taskContext.task.deadline)
      : undefined;
    const nextExpiresAt = data.expires_at ?? grant.expires_at;
    const effectiveExpiresAt = earliestDate(
      nextExpiresAt,
      taskDeadline,
      parent?.effective_expires_at,
    );
    if (effectiveExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Grant is already expired under the task or parent grant');
    }

    const updated = await this.prisma.grant.update({
      where: { id: data.grant_id },
      data: {
        permissions: nextPermissions,
        expires_at: nextExpiresAt,
        effective_expires_at: effectiveExpiresAt,
      },
    });
    await this.shortenDescendantExpiries(data.grant_id, effectiveExpiresAt);
    return this.toDto(updated);
  }

  async revokeTaskDocumentGrant(data: {
    grant_id: string;
    task_id: string;
    resource_id: string;
    reason: string;
    caller_id: string;
  }): Promise<GrantDto> {
    const grant = await this.prisma.grant.findUnique({ where: { id: data.grant_id } });
    if (!grant) throw new NotFoundException('Grant not found');
    this.assertTaskDocumentGrant(grant, data.task_id, data.resource_id);
    if (grant.grantor_id !== data.caller_id) {
      throw new ForbiddenException('Only the grantor may revoke this grant');
    }
    return this.revokeGrant(data.grant_id, data.reason);
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

  async listGrants(
    filters?: {
      actor_id?: string;
      grantor_id?: string;
      resource_type?: string;
      resource_id?: string;
      status?: string;
      task_id?: string;
    },
    pagination: PaginationQuery = DEFAULT_PAGINATION,
  ): Promise<PaginatedResponse<GrantDto>> {
    const where = filters;
    const [total, grants] = await Promise.all([
      this.prisma.grant.count({ where }),
      this.prisma.grant.findMany({
        where: filters,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        ...toPrismaPagination(pagination),
      }),
    ]);
    return {
      items: grants.map((g) => this.toDto(g)),
      pagination: createPaginationMeta(pagination.page, pagination.page_size, total),
    };
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

    this.assertKnownPermissions(parent.permissions);
    if (parent.resource_type === ResourceType.DOCUMENT) {
      if (!(await this.taskDocumentClient.exists(parent.task_id, parent.resource_id))) {
        throw new BadRequestException(
          'Parent document grant has no valid task-document association',
        );
      }

      const context = await this.taskContextClient.getContext(parent.task_id);
      if (!isDirectTaskParticipant(context, data.actor_id)) {
        throw new ForbiddenException('Grant recipient must be a direct task participant');
      }
    }

    const delegatedPermissions = data.permissions || parent.permissions;
    for (const perm of delegatedPermissions) {
      if (!parent.permissions.includes(perm)) {
        throw new BadRequestException(`Cannot delegate permission not held by parent: ${perm}`);
      }
    }

    const taskContext = await this.taskContextClient.getContext(parent.task_id);
    const taskDeadline = taskContext.task.deadline
      ? new Date(taskContext.task.deadline)
      : undefined;
    const effectiveExpiresAt = earliestDate(parent.effective_expires_at, taskDeadline);

    const delegated = await this.prisma.grant.create({
      data: {
        grantor_id: parent.grantor_id,
        actor_id: data.actor_id,
        resource_type: parent.resource_type,
        resource_id: parent.resource_id,
        permissions: delegatedPermissions,
        task_id: parent.task_id,
        expires_at: parent.expires_at,
        effective_expires_at: effectiveExpiresAt,
        status: 'ACTIVE',
        parent_grant_id: data.parent_grant_id,
      },
    });
    return this.toDto(delegated);
  }

  private async requireActiveParent(
    parentGrantId: string,
    data: {
      actor_id: string;
      resource_type: string;
      resource_id: string;
      task_id: string;
    },
  ) {
    const parent = await this.prisma.grant.findUnique({ where: { id: parentGrantId } });
    if (!parent) throw new NotFoundException('Parent grant not found');
    if (parent.status !== 'ACTIVE') throw new BadRequestException('Parent grant must be ACTIVE');
    if (parent.revoked_at) throw new BadRequestException('Parent grant is revoked');
    if (parent.effective_expires_at.getTime() <= Date.now()) {
      throw new BadRequestException('Parent grant is expired');
    }
    if (
      parent.resource_type !== data.resource_type ||
      parent.resource_id !== data.resource_id ||
      parent.task_id !== data.task_id
    ) {
      throw new BadRequestException('Parent grant does not match the requested task resource');
    }
    if (
      parent.resource_type === ResourceType.DOCUMENT &&
      !(await this.taskDocumentClient.exists(parent.task_id, parent.resource_id))
    ) {
      throw new BadRequestException('Parent document grant has no valid task-document association');
    }
    return parent;
  }

  private assertKnownPermissions(permissions: string[]): void {
    if (permissions.some((permission) => !isPermissionAction(permission))) {
      throw new BadRequestException('Grant contains an invalid permission action');
    }
  }

  private assertTaskDocumentGrant(
    grant: { resource_type: string; resource_id: string; task_id: string },
    taskId: string,
    resourceId: string,
  ): void {
    if (
      grant.resource_type !== ResourceType.DOCUMENT ||
      grant.resource_id !== resourceId ||
      grant.task_id !== taskId
    ) {
      throw new NotFoundException('Task-document grant not found');
    }
  }

  private async shortenDescendantExpiries(
    grantId: string,
    effectiveExpiresAt: Date,
  ): Promise<void> {
    const pending = [grantId];
    while (pending.length > 0) {
      const parentId = pending.shift();
      if (!parentId) continue;
      const children = await this.prisma.grant.findMany({
        where: { parent_grant_id: parentId },
        select: { id: true, effective_expires_at: true },
      });
      for (const child of children) {
        if (child.effective_expires_at.getTime() > effectiveExpiresAt.getTime()) {
          await this.prisma.grant.update({
            where: { id: child.id },
            data: { effective_expires_at: effectiveExpiresAt },
          });
        }
        pending.push(child.id);
      }
    }
  }

  private assertPermissionSubset(requested: string[], available: string[]): void {
    for (const permission of requested) {
      if (!available.includes(permission)) {
        throw new BadRequestException(`Cannot grant permission not held by parent: ${permission}`);
      }
    }
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

function earliestDate(...dates: Array<Date | undefined>): Date {
  const defined = dates.filter((date): date is Date => Boolean(date));
  if (defined.length === 0) {
    throw new BadRequestException('At least one expiration date is required');
  }
  return new Date(Math.min(...defined.map((date) => date.getTime())));
}

function isDirectTaskParticipant(
  context: {
    task: { creator_id: string; assignee_id: string | null };
    participants: Array<{ user_id: string; role: string }>;
  },
  userId: string,
): boolean {
  return (
    context.task.creator_id === userId ||
    context.task.assignee_id === userId ||
    context.participants.some((participant) => participant.user_id === userId)
  );
}
