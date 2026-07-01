import { Controller, Post, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  PERMISSION_CHECK_PATH,
  denied,
  type PermissionCheckRequest,
  type PermissionCheckResponse,
  permissionCheckRequestSchema,
  PermissionReasonCode,
  isAdminForbiddenAction,
} from '@c17/contracts';

/**
 * Permission Service (V3 §8.1). Sole authority for content access decisions.
 *
 * Default deny, fail closed: any error or timeout produces a denial with
 * PERMISSION_SERVICE_UNAVAILABLE, never an allow (V3 §5.5.3, ADR-0001).
 */
@ApiTags('permissions')
@Controller()
export class PermissionsController {
  @Post(PERMISSION_CHECK_PATH)
  @ApiOperation({ summary: 'Check whether an actor has a permission on a resource' })
  check(@Body() request: PermissionCheckRequest): PermissionCheckResponse {
    const parsed = permissionCheckRequestSchema.safeParse(request);
    if (!parsed.success) {
      return denied(PermissionReasonCode.PERMISSION_SERVICE_UNAVAILABLE);
    }

    const req = parsed.data;

    // V3 §5.2.1: ADMIN content hard-deny. An ADMIN account can never perform a content-adjacent
    // action. This is enforced here, in Permission Service, not only at the Gateway.
    if (isAdminForbiddenAction(req.action)) {
      // Would check `actor.role === 'ADMIN'` here in a real implementation.
      // For Phase 1 baseline, we deny by default.
      return denied(PermissionReasonCode.ADMIN_CONTENT_DENIED);
    }

    // Phase 1 baseline: no actual permissions granted yet. Everything else is denied.
    // In Phase 2+, this would check the Grant and DelegatedGrant tables.
    return denied(PermissionReasonCode.NO_GRANT);
  }
}
