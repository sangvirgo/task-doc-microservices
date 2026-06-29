"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionCheckResponseSchema = exports.permissionCheckRequestSchema = exports.PERMISSION_CHECK_TIMEOUT_MS = exports.PERMISSION_CHECK_PATH = void 0;
exports.denied = denied;
exports.allowed = allowed;
const zod_1 = require("zod");
const permission_actions_1 = require("./permission-actions");
const permission_reason_codes_1 = require("./permission-reason-codes");
exports.PERMISSION_CHECK_PATH = '/internal/permissions/check';
exports.PERMISSION_CHECK_TIMEOUT_MS = 2000;
exports.permissionCheckRequestSchema = zod_1.z
    .object({
    actor_id: zod_1.z.string().uuid(),
    resource_type: zod_1.z.nativeEnum(permission_actions_1.ResourceType),
    resource_id: zod_1.z.string().uuid(),
    action: zod_1.z.nativeEnum(permission_actions_1.PermissionAction),
    task_id: zod_1.z.string().uuid().nullable().optional(),
    correlation_id: zod_1.z.string().uuid(),
})
    .strict();
exports.permissionCheckResponseSchema = zod_1.z
    .object({
    allowed: zod_1.z.boolean(),
    reason_code: zod_1.z.nativeEnum(permission_reason_codes_1.PermissionReasonCode).nullable(),
    effective_expires_at: zod_1.z.string().datetime().nullable(),
})
    .strict();
function denied(reasonCode, effectiveExpiresAt = null) {
    return { allowed: false, reason_code: reasonCode, effective_expires_at: effectiveExpiresAt };
}
function allowed(effectiveExpiresAt = null) {
    return { allowed: true, reason_code: null, effective_expires_at: effectiveExpiresAt };
}
//# sourceMappingURL=permission-check.contract.js.map