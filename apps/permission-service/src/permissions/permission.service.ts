import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';

import { PermissionAction, PermissionReasonCode, isAdminForbiddenAction } from '@c17/contracts';
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

/**
 * Permission Service RBAC evaluation (V3 §8.1, ADR-0001).
 *
 * Implementation: Prisma-backed grant lookup, expiry checking, revocation checking, and ADMIN hard-deny.
 */
@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(private readonly prisma: PermissionPrismaService) {}

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

      // Step 2: Look up active grant for actor + resource (V3 §5.5.2)
      const grant = await this.prisma.grant.findFirst({
        where: {
          actor_id: request.actor_id,
          resource_type: request.resource_type,
          resource_id: request.resource_id,
          status: 'ACTIVE',
          revoked_at: null,
        },
      });

      if (!grant) {
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

    const updated = await this.prisma.grant.update({
      where: { id: grant_id },
      data: {
        status: 'REVOKED',
        revoked_at: new Date(),
        revocation_reason: revocation_reason || null,
      },
    });
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
