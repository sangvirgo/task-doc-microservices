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
const core_1 = require("@nestjs/core");
const jwt_1 = require("@nestjs/jwt");
const zod_1 = require("zod");
const config_1 = require("../../../libs/config/src");
const observability_1 = require("../../../libs/observability/src");
const jwt_auth_guard_1 = require("./auth/jwt-auth.guard");
const gateway_controller_1 = require("./proxy/gateway.controller");
const rate_limit_guard_1 = require("./rate-limit/rate-limit.guard");
exports.SERVICE = 'api-gateway';
exports.envSchema = config_1.baseEnvSchema.extend({
    JWT_SECRET: zod_1.z.string().min(32),
    JWT_TTL_SECONDS: zod_1.z.coerce.number().int().positive().default(1800),
    GATEWAY_TIMEOUT_MS: zod_1.z.coerce.number().int().positive().default(10_000),
    RATE_LIMIT_WINDOW_MS: zod_1.z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: zod_1.z.coerce.number().int().positive().default(100),
    AUTH_SERVICE_URL: zod_1.z.string().url().default('http://localhost:3001'),
    USER_ROLE_SERVICE_URL: zod_1.z.string().url().default('http://localhost:3002'),
    TASK_SERVICE_URL: zod_1.z.string().url().default('http://localhost:3003'),
    DOCUMENT_SERVICE_URL: zod_1.z.string().url().default('http://localhost:3004'),
    DOCUMENT_SECURITY_SERVICE_URL: zod_1.z.string().url().default('http://localhost:3005'),
    PERMISSION_SERVICE_URL: zod_1.z.string().url().default('http://localhost:3006'),
    AUDIT_SERVICE_URL: zod_1.z.string().url().default('http://localhost:3007'),
    NOTIFICATION_SERVICE_URL: zod_1.z.string().url().default('http://localhost:3008'),
    SECURITY_MONITORING_SERVICE_URL: zod_1.z.string().url().default('http://localhost:3009'),
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
        controllers: [gateway_controller_1.GatewayController],
        providers: [
            { provide: core_1.APP_GUARD, useClass: rate_limit_guard_1.RateLimitGuard },
            { provide: core_1.APP_GUARD, useClass: jwt_auth_guard_1.JwtAuthGuard },
            jwt_auth_guard_1.JwtAuthGuard,
            rate_limit_guard_1.RateLimitGuard,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map