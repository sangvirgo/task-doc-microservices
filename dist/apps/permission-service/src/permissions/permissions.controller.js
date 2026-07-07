"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const contracts_1 = require("../../../../libs/contracts/src");
const permission_service_1 = require("./permission.service");
const createGrantSchema = zod_1.z.object({
    grantor_id: zod_1.z.string().uuid(),
    actor_id: zod_1.z.string().uuid(),
    resource_type: zod_1.z.string().min(1),
    resource_id: zod_1.z.string().uuid(),
    permissions: zod_1.z.array(zod_1.z.string()).min(1),
    task_id: zod_1.z.string().uuid(),
    expires_at: zod_1.z.string().datetime(),
    parent_grant_id: zod_1.z.string().uuid().optional(),
});
const delegateSchema = zod_1.z.object({
    actor_id: zod_1.z.string().uuid(),
    permissions: zod_1.z.array(zod_1.z.string()).optional(),
});
const revokeSchema = zod_1.z.object({
    reason: zod_1.z.string().optional(),
});
let PermissionsController = class PermissionsController {
    permissionService;
    constructor(permissionService) {
        this.permissionService = permissionService;
    }
    async check(request) {
        const parsed = contracts_1.permissionCheckRequestSchema.safeParse(request);
        if (!parsed.success) {
            return (0, contracts_1.denied)(contracts_1.PermissionReasonCode.PERMISSION_SERVICE_UNAVAILABLE);
        }
        const req = parsed.data;
        return this.permissionService.check({
            actor_id: req.actor_id,
            actor_role: req.actor_role,
            resource_type: req.resource_type,
            resource_id: req.resource_id,
            action: req.action,
            task_id: req.task_id,
        });
    }
    async createGrant(body) {
        const parsed = createGrantSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        return this.permissionService.createGrant({
            grantor_id: parsed.data.grantor_id,
            actor_id: parsed.data.actor_id,
            resource_type: parsed.data.resource_type,
            resource_id: parsed.data.resource_id,
            permissions: parsed.data.permissions,
            task_id: parsed.data.task_id,
            expires_at: new Date(parsed.data.expires_at),
            parent_grant_id: parsed.data.parent_grant_id,
        });
    }
    async listGrants(actor_id, resource_type, resource_id, status, task_id) {
        return this.permissionService.listGrants({
            actor_id,
            resource_type,
            resource_id,
            status,
            task_id,
        });
    }
    async getGrant(id) {
        return this.permissionService.getGrant(id);
    }
    async delegateGrant(parentGrantId, body) {
        const parsed = delegateSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        return this.permissionService.delegateGrant({
            parent_grant_id: parentGrantId,
            actor_id: parsed.data.actor_id,
            permissions: parsed.data.permissions,
        });
    }
    async revokeGrant(id, body) {
        const parsed = revokeSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        return this.permissionService.revokeGrant(id, parsed.data.reason);
    }
};
exports.PermissionsController = PermissionsController;
__decorate([
    (0, common_1.Post)(contracts_1.PERMISSION_CHECK_PATH),
    (0, swagger_1.ApiOperation)({ summary: 'Check whether an actor has a permission on a resource' }),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PermissionsController.prototype, "check", null);
__decorate([
    (0, common_1.Post)('grants'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new grant' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", Promise)
], PermissionsController.prototype, "createGrant", null);
__decorate([
    (0, common_1.Get)('grants'),
    (0, swagger_1.ApiOperation)({ summary: 'List grants with filters' }),
    __param(0, (0, common_1.Query)('actor_id')),
    __param(1, (0, common_1.Query)('resource_type')),
    __param(2, (0, common_1.Query)('resource_id')),
    __param(3, (0, common_1.Query)('status')),
    __param(4, (0, common_1.Query)('task_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PermissionsController.prototype, "listGrants", null);
__decorate([
    (0, common_1.Get)('grants/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a grant by ID' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PermissionsController.prototype, "getGrant", null);
__decorate([
    (0, common_1.Post)('grants/:id/delegate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Delegate a grant to another actor' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0]),
    __metadata("design:returntype", Promise)
], PermissionsController.prototype, "delegateGrant", null);
__decorate([
    (0, common_1.Delete)('grants/:id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Revoke a grant' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0]),
    __metadata("design:returntype", Promise)
], PermissionsController.prototype, "revokeGrant", null);
exports.PermissionsController = PermissionsController = __decorate([
    (0, swagger_1.ApiTags)('permissions'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [permission_service_1.PermissionService])
], PermissionsController);
//# sourceMappingURL=permissions.controller.js.map