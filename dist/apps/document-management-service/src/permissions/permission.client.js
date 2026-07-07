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
var PermissionClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionClient = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
const contracts_1 = require("../../../../libs/contracts/src");
let PermissionClient = PermissionClient_1 = class PermissionClient {
    configService;
    logger = new common_1.Logger(PermissionClient_1.name);
    permissionServiceUrl;
    checkTimeoutMs;
    constructor(configService) {
        this.configService = configService;
        this.permissionServiceUrl =
            this.configService.get('PERMISSION_SERVICE_URL') || 'http://localhost:3006';
        this.checkTimeoutMs = this.configService.get('PERMISSION_CHECK_TIMEOUT_MS') || 2000;
    }
    async check(request) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.checkTimeoutMs);
            const payload = {
                ...request,
                correlation_id: (0, crypto_1.randomUUID)(),
            };
            const response = await fetch(`${this.permissionServiceUrl}/internal/permissions/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            if (!response.ok) {
                this.logger.error(`Permission check failed: ${response.status}`, payload);
                return {
                    allowed: false,
                    reason_code: 'PERMISSION_SERVICE_UNAVAILABLE',
                    effective_expires_at: null,
                };
            }
            const body = await response.json();
            const parsed = contracts_1.permissionCheckResponseSchema.safeParse(body);
            if (!parsed.success) {
                this.logger.error('Permission check response schema mismatch', parsed.error.flatten());
                return (0, contracts_1.denied)(contracts_1.PermissionReasonCode.PERMISSION_SERVICE_UNAVAILABLE);
            }
            return parsed.data;
        }
        catch (error) {
            this.logger.error('Permission check error', { error, request });
            return (0, contracts_1.denied)(contracts_1.PermissionReasonCode.PERMISSION_SERVICE_UNAVAILABLE);
        }
    }
};
exports.PermissionClient = PermissionClient;
exports.PermissionClient = PermissionClient = PermissionClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], PermissionClient);
//# sourceMappingURL=permission.client.js.map