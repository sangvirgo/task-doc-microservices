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
exports.SecurityController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const security_pipeline_service_1 = require("./security-pipeline.service");
const processDocumentSchema = zod_1.z.object({
    document_id: zod_1.z.string().uuid(),
    version: zod_1.z.number().int().positive(),
    object_key: zod_1.z.string().min(1),
    checksum: zod_1.z.string().min(1),
    encrypted_dek: zod_1.z.string().min(1),
    iv: zod_1.z.string().min(1),
    auth_tag: zod_1.z.string().min(1),
    file_size: zod_1.z.number().int().positive(),
    mime_type: zod_1.z.string().min(1),
    kek_version: zod_1.z.number().int().positive().optional(),
});
const scanResultSchema = zod_1.z.object({
    scan_status: zod_1.z.enum(['CLEAN', 'INFECTED', 'ERROR']),
    scan_result: zod_1.z.string().optional(),
});
const signSchema = zod_1.z.object({
    signature: zod_1.z.string().min(1),
});
let SecurityController = class SecurityController {
    securityService;
    constructor(securityService) {
        this.securityService = securityService;
    }
    async processDocument(body) {
        const parsed = processDocumentSchema.safeParse(body);
        if (!parsed.success)
            throw new common_1.BadRequestException(parsed.error.issues);
        return this.securityService.processDocument(parsed.data);
    }
    async updateScan(documentId, version, body) {
        const parsed = scanResultSchema.safeParse(body);
        if (!parsed.success)
            throw new common_1.BadRequestException(parsed.error.issues);
        const versionNum = parseInt(version, 10);
        if (isNaN(versionNum))
            throw new common_1.BadRequestException('Invalid version number');
        return this.securityService.updateScanResult(documentId, versionNum, parsed.data.scan_status, parsed.data.scan_result);
    }
    async signDocument(documentId, version, body) {
        const parsed = signSchema.safeParse(body);
        if (!parsed.success)
            throw new common_1.BadRequestException(parsed.error.issues);
        const versionNum = parseInt(version, 10);
        if (isNaN(versionNum))
            throw new common_1.BadRequestException('Invalid version number');
        return this.securityService.signDocument(documentId, versionNum, parsed.data.signature);
    }
    async getRecord(documentId, version) {
        const versionNum = parseInt(version, 10);
        if (isNaN(versionNum))
            throw new common_1.BadRequestException('Invalid version number');
        return this.securityService.getRecord(documentId, versionNum);
    }
    async listRecords(document_id) {
        return this.securityService.listRecords(document_id);
    }
    async getActiveKek() {
        const version = await this.securityService.getActiveKekVersion();
        return { active_kek_version: version };
    }
    async rotateKek() {
        return this.securityService.rotateKek();
    }
};
exports.SecurityController = SecurityController;
__decorate([
    (0, common_1.Post)('process'),
    (0, swagger_1.ApiOperation)({ summary: 'Process a document through the security pipeline' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "processDocument", null);
__decorate([
    (0, common_1.Post)(':documentId/versions/:version/scan'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Update scan result for a document version' }),
    __param(0, (0, common_1.Param)('documentId')),
    __param(1, (0, common_1.Param)('version')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, void 0]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "updateScan", null);
__decorate([
    (0, common_1.Post)(':documentId/versions/:version/sign'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Sign a document version (must be CLEAN)' }),
    __param(0, (0, common_1.Param)('documentId')),
    __param(1, (0, common_1.Param)('version')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, void 0]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "signDocument", null);
__decorate([
    (0, common_1.Get)(':documentId/versions/:version'),
    (0, swagger_1.ApiOperation)({ summary: 'Get encryption record for a document version' }),
    __param(0, (0, common_1.Param)('documentId')),
    __param(1, (0, common_1.Param)('version')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "getRecord", null);
__decorate([
    (0, common_1.Get)('records'),
    (0, swagger_1.ApiOperation)({ summary: 'List encryption records' }),
    __param(0, (0, common_1.Query)('document_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "listRecords", null);
__decorate([
    (0, common_1.Get)('kek/active'),
    (0, swagger_1.ApiOperation)({ summary: 'Get active KEK version' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "getActiveKek", null);
__decorate([
    (0, common_1.Post)('kek/rotate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Rotate KEK (creates new version, deactivates old)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "rotateKek", null);
exports.SecurityController = SecurityController = __decorate([
    (0, swagger_1.ApiTags)('security'),
    (0, common_1.Controller)('security'),
    __metadata("design:paramtypes", [security_pipeline_service_1.SecurityPipelineService])
], SecurityController);
//# sourceMappingURL=security.controller.js.map