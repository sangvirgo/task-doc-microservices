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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const contracts_1 = require("../../../../libs/contracts/src");
const user_role_prisma_service_1 = require("../prisma/user-role-prisma.service");
let UsersService = class UsersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createUser(data) {
        const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
        if (existing) {
            throw new common_1.ConflictException('Email already exists');
        }
        const user = await this.prisma.user.create({
            data: { id: data.id, email: data.email, role: data.role },
            include: { Capability: true },
        });
        return this.toDto(user);
    }
    async getUser(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: { Capability: true },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return this.toDto(user);
    }
    async listUsers() {
        const users = await this.prisma.user.findMany({ include: { Capability: true } });
        return users.map((u) => this.toDto(u));
    }
    async lockUser(id) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (user.locked_at)
            throw new common_1.BadRequestException('User is already locked');
        const updated = await this.prisma.user.update({
            where: { id },
            data: { locked_at: new Date() },
            include: { Capability: true },
        });
        return this.toDto(updated);
    }
    async unlockUser(id) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (!user.locked_at)
            throw new common_1.BadRequestException('User is not locked');
        const updated = await this.prisma.user.update({
            where: { id },
            data: { locked_at: null },
            include: { Capability: true },
        });
        return this.toDto(updated);
    }
    async grantCapability(userId, capability) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { Capability: true },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (user.role === 'ADMIN') {
            throw new common_1.BadRequestException('ADMIN cannot hold capabilities');
        }
        if (user.role === 'ADMIN' && (0, contracts_1.isContentAdjacentCapability)(capability)) {
            throw new common_1.BadRequestException('ADMIN cannot hold content-adjacent capability');
        }
        const existing = user.Capability.find((c) => c.capability === capability);
        if (existing) {
            throw new common_1.ConflictException('Capability already granted');
        }
        await this.prisma.capability.create({
            data: { user_id: userId, capability },
        });
        return this.getUser(userId);
    }
    async revokeCapability(userId, capability) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const result = await this.prisma.capability.deleteMany({
            where: { user_id: userId, capability },
        });
        if (result.count === 0) {
            throw new common_1.NotFoundException('Capability not found');
        }
        return this.getUser(userId);
    }
    toDto(user) {
        return {
            id: user.id,
            email: user.email,
            role: user.role,
            locked_at: user.locked_at?.toISOString() ?? null,
            capabilities: user.Capability.map((c) => c.capability),
            created_at: user.created_at.toISOString(),
        };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [user_role_prisma_service_1.UserRolePrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map