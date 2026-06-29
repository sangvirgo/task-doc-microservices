"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = exports.envSchema = exports.SERVICE = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const zod_1 = require("zod");
const config_1 = require("../../../libs/config/src");
const observability_1 = require("../../../libs/observability/src");
const auth_controller_1 = require("./auth/auth.controller");
const auth_service_1 = require("./auth/auth.service");
const auth_prisma_service_1 = require("./prisma/auth-prisma.service");
const redis_service_1 = require("./redis/redis.service");
exports.SERVICE = 'authentication-identity-service';
exports.envSchema = config_1.baseEnvSchema.extend({
    JWT_SECRET: zod_1.z.string().min(32),
    JWT_TTL_SECONDS: zod_1.z.coerce.number().int().positive().default(1800),
    AUTH_DATABASE_URL: zod_1.z.string().url(),
    REDIS_URL: zod_1.z.string().default('redis://localhost:6379'),
});
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.AppConfigModule.forRoot({ serviceName: exports.SERVICE, schema: exports.envSchema }),
            observability_1.ObservabilityModule,
            jwt_1.JwtModule.register({
                secret: process.env.JWT_SECRET || 'dev-secret-min-32-chars-required',
                signOptions: { expiresIn: Number(process.env.JWT_TTL_SECONDS ?? 1800) },
            }),
        ],
        controllers: [auth_controller_1.AuthController],
        providers: [auth_service_1.AuthService, auth_prisma_service_1.AuthPrismaService, redis_service_1.RedisService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map