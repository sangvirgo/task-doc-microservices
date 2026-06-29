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
var AuditClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditClient = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
let AuditClient = AuditClient_1 = class AuditClient {
    configService;
    logger = new common_1.Logger(AuditClient_1.name);
    auditServiceUrl;
    timeoutMs;
    constructor(configService) {
        this.configService = configService;
        this.auditServiceUrl =
            this.configService.get('AUDIT_SERVICE_URL') || 'http://localhost:3007';
        this.timeoutMs = this.configService.get('AUDIT_TIMEOUT_MS') || 2000;
    }
    async record(event) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(`${this.auditServiceUrl}/audit/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event_id: (0, crypto_1.randomUUID)(),
                    event_type: event.event_type,
                    occurred_at: new Date().toISOString(),
                    actor_id: event.actor_id,
                    resource_type: event.resource_type,
                    resource_id: event.resource_id,
                    payload: event.payload,
                }),
                signal: controller.signal,
            });
            if (!response.ok) {
                this.logger.warn(`Audit record failed: ${response.status} for ${event.event_type}`);
            }
        }
        catch (error) {
            this.logger.warn(`Audit client error for ${event.event_type}: ${error instanceof Error ? error.message : 'unknown'}`);
        }
        finally {
            clearTimeout(timeout);
        }
    }
};
exports.AuditClient = AuditClient;
exports.AuditClient = AuditClient = AuditClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AuditClient);
//# sourceMappingURL=audit.client.js.map