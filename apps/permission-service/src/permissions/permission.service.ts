import { Injectable } from '@nestjs/common';

import { PermissionReasonCode, isAdminForbiddenAction } from '@c17/contracts';

/**
 * Permission Service RBAC evaluation (V3 §8.1, ADR-0001).
 *
 * Baseline implementation: check ADMIN hard-deny and grant lookup.
 * Phase 2: wire to permission_db for actual grant queries.
 */
@Injectable()
export class PermissionService {
  /**
   * Check whether an actor has permission on a resource.
   *
   * Default deny, fail-closed:
   * - ADMIN hard-deny: ADMIN_CONTENT_DENIED
   * - No grant: NO_GRANT
   * - Grant expired: GRANT_EXPIRED (checked against effective_expires_at)
   * - Grant revoked: GRANT_REVOKED
   * - All other errors: PERMISSION_SERVICE_UNAVAILABLE
   *
   * Phase 1: check ADMIN only; return default deny for everything else.
   * Phase 2: query permission_db for grants; evaluate expiry, revocation, capabilities.
   */
  check(request: {
    actor_id: string;
    resource_type: string;
    resource_id: string;
    action: string;
    task_id?: string | null;
  }): { allowed: boolean; reason_code: PermissionReasonCode | null; effective_expires_at: string | null } {
    // V3 §5.2.1: ADMIN content hard-deny.
    // This is enforced here, in Permission Service, not only at the Gateway.
    if (isAdminForbiddenAction(request.action)) {
      // Phase 1: no actual role check yet. Phase 2: check actor.role === 'ADMIN'.
      // For now, return ADMIN_CONTENT_DENIED for all admin-forbidden actions.
      return {
        allowed: false,
        reason_code: PermissionReasonCode.ADMIN_CONTENT_DENIED,
        effective_expires_at: null,
      };
    }

    // Phase 1 baseline: no grants in database yet; default deny.
    // Phase 2: SELECT grant FROM permission_db WHERE actor_id = ? AND resource_id = ?
    return {
      allowed: false,
      reason_code: PermissionReasonCode.NO_GRANT,
      effective_expires_at: null,
    };
  }

  /**
   * Seed baseline permission grants (Phase 2).
   *
   * Phase 1: this is where grants would be created programmatically.
   * Currently a stub.
   */
  seedBaselineGrants(): void {
    // Phase 2: create initial grants for demo users and resources
    // INSERT INTO grant (actor_id, resource_type, resource_id, task_id, permissions, expires_at, effective_expires_at)
  }
}
