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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const bcryptjs_1 = require("bcryptjs");
const crypto_1 = require("crypto");
const auth_prisma_service_1 = require("../prisma/auth-prisma.service");
const redis_service_1 = require("../redis/redis.service");
const REFRESH_TOKEN_TTL_DAYS = 7;
const SESSION_TTL_SECONDS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 1800;
let AuthService = class AuthService {
    jwtService;
    prisma;
    redis;
    constructor(jwtService, prisma, redis) {
        this.jwtService = jwtService;
        this.prisma = prisma;
        this.redis = redis;
    }
    hashPassword(password) {
        return (0, bcryptjs_1.hashSync)(password, 10);
    }
    verifyPassword(plaintext, passwordHash) {
        return (0, bcryptjs_1.compareSync)(plaintext, passwordHash);
    }
    async register(email, password, role = 'EMPLOYEE') {
        const passwordHash = this.hashPassword(password);
        const user = await this.prisma.user.create({
            data: { email, password_hash: passwordHash, role },
        });
        return { id: user.id, email: user.email, role: user.role };
    }
    async login(email, password) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (user.locked_at) {
            throw new common_1.UnauthorizedException('Account is locked');
        }
        if (!this.verifyPassword(password, user.password_hash)) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        return this.issueTokenPair(user.id, user.email, user.role);
    }
    async refresh(refreshToken) {
        const tokenHash = this.hashToken(refreshToken);
        const storedToken = await this.prisma.refreshToken.findUnique({
            where: { token_hash: tokenHash },
            include: { user: true },
        });
        if (!storedToken) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        if (storedToken.revoked_at) {
            throw new common_1.UnauthorizedException('Refresh token has been revoked');
        }
        if (storedToken.expires_at < new Date()) {
            throw new common_1.UnauthorizedException('Refresh token has expired');
        }
        if (storedToken.user.locked_at) {
            throw new common_1.UnauthorizedException('Account is locked');
        }
        await this.prisma.refreshToken.update({
            where: { id: storedToken.id },
            data: { revoked_at: new Date() },
        });
        return this.issueTokenPair(storedToken.user.id, storedToken.user.email, storedToken.user.role);
    }
    async logout(refreshToken) {
        const tokenHash = this.hashToken(refreshToken);
        const storedToken = await this.prisma.refreshToken.findUnique({
            where: { token_hash: tokenHash },
        });
        if (storedToken && !storedToken.revoked_at) {
            await this.prisma.refreshToken.update({
                where: { id: storedToken.id },
                data: { revoked_at: new Date() },
            });
            await this.redis.deleteSession(storedToken.id);
        }
    }
    async revokeAllUserTokens(userId) {
        await this.prisma.refreshToken.updateMany({
            where: { user_id: userId, revoked_at: null },
            data: { revoked_at: new Date() },
        });
        await this.redis.deleteUserSessions(userId);
    }
    verifyAccessToken(token) {
        return this.jwtService.verify(token);
    }
    async issueTokenPair(userId, email, role) {
        const accessToken = this.jwtService.sign({ sub: userId, role, capabilities: [] }, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
        const rawRefreshToken = (0, crypto_1.randomUUID)();
        const tokenHash = this.hashToken(rawRefreshToken);
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
        const refreshTokenRecord = await this.prisma.refreshToken.create({
            data: {
                user_id: userId,
                token_hash: tokenHash,
                expires_at: expiresAt,
            },
        });
        await this.redis.setSession(refreshTokenRecord.id, { userId, email, role, capabilities: [], refreshTokenId: refreshTokenRecord.id }, SESSION_TTL_SECONDS);
        return {
            access_token: accessToken,
            refresh_token: rawRefreshToken,
            expires_in_seconds: ACCESS_TOKEN_TTL_SECONDS,
        };
    }
    hashToken(token) {
        return (0, crypto_1.createHash)('sha256').update(token).digest('hex');
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        auth_prisma_service_1.AuthPrismaService,
        redis_service_1.RedisService])
], AuthService);
//# sourceMappingURL=auth.service.js.map