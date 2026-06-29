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
const zod_1 = require("zod");
const config_1 = require("../../../libs/config/src");
const observability_1 = require("../../../libs/observability/src");
const audit_controller_1 = require("./audit/audit.controller");
const audit_service_1 = require("./audit/audit.service");
const audit_prisma_service_1 = require("./prisma/audit-prisma.service");
exports.SERVICE = 'audit-log-service';
exports.envSchema = config_1.baseEnvSchema.extend({
    AUDIT_DATABASE_URL: zod_1.z.string().url(),
});
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.AppConfigModule.forRoot({ serviceName: exports.SERVICE, schema: exports.envSchema }),
            observability_1.ObservabilityModule,
        ],
        controllers: [audit_controller_1.AuditController],
        providers: [audit_prisma_service_1.AuditPrismaService, audit_service_1.AuditService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map