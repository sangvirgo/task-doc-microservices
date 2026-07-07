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
var PermissionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionService = void 0;
const common_1 = require("@nestjs/common");
const contracts_1 = require("@c17/contracts");
const permission_prisma_service_1 = require("../prisma/permission-prisma.service");
let PermissionService = PermissionService_1 = class PermissionService {
    prisma;
    logger = new common_1.Logger(PermissionService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async check(request) {
        try {
            if (request.actor_role === 'ADMIN' && (0, contracts_1.isAdminForbiddenAction)(request.action)) {
                return {
                    allowed: false,
                    reason_code: contracts_1.PermissionReasonCode.ADMIN_CONTENT_DENIED,
                    effective_expires_at: null,
                };
            }
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
                    reason_code: contracts_1.PermissionReasonCode.NO_GRANT,
                    effective_expires_at: null,
                };
            }
            const now = new Date();
            if (now > grant.effective_expires_at) {
                return {
                    allowed: false,
                    reason_code: contracts_1.PermissionReasonCode.GRANT_EXPIRED,
                    effective_expires_at: grant.effective_expires_at.toISOString(),
                };
            }
            if (!grant.permissions.includes(request.action)) {
                return {
                    allowed: false,
                    reason_code: contracts_1.PermissionReasonCode.MISSING_CAPABILITY,
                    effective_expires_at: grant.effective_expires_at.toISOString(),
                };
            }
            return {
                allowed: true,
                reason_code: null,
                effective_expires_at: grant.effective_expires_at.toISOString(),
            };
        }
        catch (error) {
            this.logger.error('Permission check error', error);
            return {
                allowed: false,
                reason_code: contracts_1.PermissionReasonCode.PERMISSION_SERVICE_UNAVAILABLE,
                effective_expires_at: null,
            };
        }
    }
    async createGrant(data) {
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
    async revokeGrant(grant_id, revocation_reason) {
        const grant = await this.prisma.grant.findUnique({ where: { id: grant_id } });
        if (!grant)
            throw new common_1.NotFoundException('Grant not found');
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
    async getGrant(id) {
        const grant = await this.prisma.grant.findUnique({ where: { id } });
        if (!grant)
            throw new common_1.NotFoundException('Grant not found');
        return this.toDto(grant);
    }
    async listGrants(filters) {
        const grants = await this.prisma.grant.findMany({
            where: filters,
            orderBy: { created_at: 'desc' },
        });
        return grants.map((g) => this.toDto(g));
    }
    async delegateGrant(data) {
        const parent = await this.prisma.grant.findUnique({
            where: { id: data.parent_grant_id },
        });
        if (!parent)
            throw new common_1.NotFoundException('Parent grant not found');
        if (parent.status !== 'ACTIVE')
            throw new common_1.BadRequestException('Parent grant must be ACTIVE');
        if (parent.revoked_at)
            throw new common_1.BadRequestException('Parent grant is revoked');
        const delegatedPermissions = data.permissions || parent.permissions;
        for (const perm of delegatedPermissions) {
            if (!parent.permissions.includes(perm)) {
                throw new common_1.BadRequestException(`Cannot delegate permission not held by parent: ${perm}`);
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
    toDto(grant) {
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
};
exports.PermissionService = PermissionService;
exports.PermissionService = PermissionService = PermissionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [permission_prisma_service_1.PermissionPrismaService])
], PermissionService);
//# sourceMappingURL=permission.service.js.map