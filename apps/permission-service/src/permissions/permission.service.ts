import { Injectable, Logger } from '@nestjs/common';

import { PermissionAction, PermissionReasonCode, isAdminForbiddenAction } from '@c17/contracts';

/**
 * In-memory grant store for Phase 1.
 * Phase 2 will replace with PostgreSQL via PrismaClient.
 */
interface PermissionGrant {
  id: string;
  actor_id: string;
  resource_type: string;
  resource_id: string;
  permissions: PermissionAction[];
  task_id: string | null;
  expires_at: Date;
  effective_expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

/**
 * Permission Service RBAC evaluation (V3 §8.1, ADR-0001).
 *
 * Implementation: grant lookup, expiry checking, revocation checking, and ADMIN hard-deny.
 * Phase 1: in-memory store with proper RBAC logic.
 * Phase 2: Replace with PostgreSQL PrismaClient while keeping the same interface.
 */
@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);
  private grants = new Map<string, PermissionGrant>();

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
  check(request: {
    actor_id: string;
    resource_type: string;
    resource_id: string;
    action: PermissionAction;
    task_id?: string | null;
  }): {
    allowed: boolean;
    reason_code: PermissionReasonCode | null;
    effective_expires_at: string | null;
  } {
    try {
      // Step 1: V3 §5.2.1 ADMIN content hard-deny (ADR-0004)
      // This is enforced here in Permission Service, not only at Gateway
      if (isAdminForbiddenAction(request.action)) {
        return {
          allowed: false,
          reason_code: PermissionReasonCode.ADMIN_CONTENT_DENIED,
          effective_expires_at: null,
        };
      }

      // Step 2: Look up grant for actor + resource (V3 §5.5.2)
      const grantKey = `${request.actor_id}:${request.resource_type}:${request.resource_id}`;
      const grant = this.grants.get(grantKey);

      if (!grant) {
        return {
          allowed: false,
          reason_code: PermissionReasonCode.NO_GRANT,
          effective_expires_at: null,
        };
      }

      // Step 3: Check revocation (V3 §5.5)
      if (grant.revoked_at) {
        return {
          allowed: false,
          reason_code: PermissionReasonCode.GRANT_REVOKED,
          effective_expires_at: grant.effective_expires_at.toISOString(),
        };
      }

      // Step 4: Check expiration (V3 §5.5.2, ADR-0001)
      // effective_expires_at is denormalized; check it at request time even before scheduled worker
      const now = new Date();
      if (now > grant.effective_expires_at) {
        return {
          allowed: false,
          reason_code: PermissionReasonCode.GRANT_EXPIRED,
          effective_expires_at: grant.effective_expires_at.toISOString(),
        };
      }

      // Step 5: Check permission is in the grant's action set
      if (!grant.permissions.includes(request.action)) {
        return {
          allowed: false,
          reason_code: PermissionReasonCode.MISSING_CAPABILITY,
          effective_expires_at: grant.effective_expires_at.toISOString(),
        };
      }

      // Step 6: Grant is valid, allow access
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

  /**
   * Seed baseline permission grants for demo/testing (V3 §5.5).
   * Phase 2: Migrate to database seeding.
   */
  seedBaselineGrants(): void {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Demo grant: user-1 can download document-1 until tomorrow
    const demoGrant: PermissionGrant = {
      id: 'grant-demo-1',
      actor_id: 'user-1',
      resource_type: 'DOCUMENT',
      resource_id: 'doc-1',
      permissions: ['DOWNLOAD', 'PREVIEW'],
      task_id: 'task-1',
      expires_at: tomorrow,
      effective_expires_at: tomorrow, // V3 §5.5.2: denormalized
      revoked_at: null,
      created_at: new Date(),
    };

    this.grants.set('user-1:DOCUMENT:doc-1', demoGrant);
  }

  /**
   * Create a permission grant (Phase 2 API).
   * Called by task-management-service when a task is created with document access.
   */
  createGrant(grant: PermissionGrant): void {
    const grantKey = `${grant.actor_id}:${grant.resource_type}:${grant.resource_id}`;
    this.grants.set(grantKey, grant);
  }

  /**
   * Revoke a permission grant.
   * Phase 2: trigger event for audit logging.
   */
  revokeGrant(grantId: string): void {
    for (const grant of this.grants.values()) {
      if (grant.id === grantId) {
        grant.revoked_at = new Date();
        break;
      }
    }
  }

  /**
   * Get all grants (for administrative review, Phase 3).
   */
  getAllGrants(): PermissionGrant[] {
    return Array.from(this.grants.values());
  }
}
