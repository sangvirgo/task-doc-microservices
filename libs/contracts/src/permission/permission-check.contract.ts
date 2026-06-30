import { z } from 'zod';

import { PermissionAction, ResourceType } from './permission-actions';
import { PermissionReasonCode } from './permission-reason-codes';

export const PERMISSION_CHECK_PATH = '/internal/permissions/check';

/** Recommended client timeout for a permission check (V3 §8.1). */
export const PERMISSION_CHECK_TIMEOUT_MS = 2000;

/**
 * Request body for POST /internal/permissions/check.
 *
 * `.strict()` is load-bearing: the caller must never supply `task.deadline`, `expires_at`, or any
 * other expiry value. Permission Service resolves expiry from its own `permission_db` only
 * (V3 §5.5.2, §8.1). A caller-supplied expiry would let the caller widen the access that gates it,
 * so an unknown field is a rejected request rather than an ignored one.
 */
export const permissionCheckRequestSchema = z
  .object({
    actor_id: z.string().uuid(),
    resource_type: z.nativeEnum(ResourceType),
    resource_id: z.string().uuid(),
    action: z.nativeEnum(PermissionAction),
    task_id: z.string().uuid().nullable().optional(),
    correlation_id: z.string().uuid(),
  })
  .strict();

export type PermissionCheckRequest = z.infer<typeof permissionCheckRequestSchema>;

export const permissionCheckResponseSchema = z
  .object({
    allowed: z.boolean(),
    reason_code: z.nativeEnum(PermissionReasonCode).nullable(),
    effective_expires_at: z.string().datetime().nullable(),
  })
  .strict();

export type PermissionCheckResponse = z.infer<typeof permissionCheckResponseSchema>;

export function denied(
  reasonCode: PermissionReasonCode,
  effectiveExpiresAt: string | null = null,
): PermissionCheckResponse {
  return { allowed: false, reason_code: reasonCode, effective_expires_at: effectiveExpiresAt };
}

export function allowed(effectiveExpiresAt: string | null = null): PermissionCheckResponse {
  return { allowed: true, reason_code: null, effective_expires_at: effectiveExpiresAt };
}
