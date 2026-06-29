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
var SecurityClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityClient = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let SecurityClient = SecurityClient_1 = class SecurityClient {
    configService;
    logger = new common_1.Logger(SecurityClient_1.name);
    securityServiceUrl;
    timeoutMs;
    constructor(configService) {
        this.configService = configService;
        this.securityServiceUrl =
            this.configService.get('DOCUMENT_SECURITY_URL') || 'http://localhost:3005';
        this.timeoutMs = this.configService.get('SECURITY_TIMEOUT_MS') || 5000;
    }
    async processDocument(params) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(`${this.securityServiceUrl}/security/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    document_id: params.document_id,
                    version: params.version,
                    object_key: params.object_key,
                    checksum: params.checksum,
                    encrypted_dek: params.encrypted_dek,
                    iv: 'placeholder-iv',
                    auth_tag: 'placeholder-tag',
                    file_size: params.file_size,
                    mime_type: params.mime_type,
                    kek_version: params.kek_version,
                }),
                signal: controller.signal,
            });
            if (!response.ok) {
                this.logger.warn(`Security processing failed: ${response.status}`);
                return null;
            }
            return (await response.json());
        }
        catch (error) {
            this.logger.warn(`Security client error: ${error instanceof Error ? error.message : 'unknown'}`);
            return null;
        }
        finally {
            clearTimeout(timeout);
        }
    }
};
exports.SecurityClient = SecurityClient;
exports.SecurityClient = SecurityClient = SecurityClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SecurityClient);
//# sourceMappingURL=security.client.js.map