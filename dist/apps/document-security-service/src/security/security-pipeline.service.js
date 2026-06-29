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
exports.SecurityPipelineService = void 0;
const common_1 = require("@nestjs/common");
const document_security_prisma_service_1 = require("../prisma/document-security-prisma.service");
let SecurityPipelineService = class SecurityPipelineService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async processDocument(data) {
        const existing = await this.prisma.encryptionRecord.findUnique({
            where: { document_id_version: { document_id: data.document_id, version: data.version } },
        });
        if (existing)
            throw new common_1.BadRequestException('Encryption record already exists for this version');
        const record = await this.prisma.encryptionRecord.create({
            data: {
                document_id: data.document_id,
                version: data.version,
                object_key: data.object_key,
                checksum: data.checksum,
                encrypted_dek: data.encrypted_dek,
                iv: data.iv,
                auth_tag: data.auth_tag,
                file_size: data.file_size,
                mime_type: data.mime_type,
                kek_version: data.kek_version || 1,
                scan_status: 'PENDING',
            },
        });
        return this.toDto(record);
    }
    async updateScanResult(document_id, version, scan_status, scan_result) {
        const record = await this.prisma.encryptionRecord.findUnique({
            where: { document_id_version: { document_id, version } },
        });
        if (!record)
            throw new common_1.NotFoundException('Encryption record not found');
        const updated = await this.prisma.encryptionRecord.update({
            where: { document_id_version: { document_id, version } },
            data: { scan_status, scan_result: scan_result || null },
        });
        return this.toDto(updated);
    }
    async signDocument(document_id, version, signature) {
        const record = await this.prisma.encryptionRecord.findUnique({
            where: { document_id_version: { document_id, version } },
        });
        if (!record)
            throw new common_1.NotFoundException('Encryption record not found');
        if (record.scan_status !== 'CLEAN')
            throw new common_1.BadRequestException('Document must pass scan before signing');
        const updated = await this.prisma.encryptionRecord.update({
            where: { document_id_version: { document_id, version } },
            data: { signature },
        });
        return this.toDto(updated);
    }
    async getRecord(document_id, version) {
        const record = await this.prisma.encryptionRecord.findUnique({
            where: { document_id_version: { document_id, version } },
        });
        if (!record)
            throw new common_1.NotFoundException('Encryption record not found');
        return this.toDto(record);
    }
    async listRecords(document_id) {
        const records = await this.prisma.encryptionRecord.findMany({
            where: document_id ? { document_id } : undefined,
            orderBy: { created_at: 'desc' },
        });
        return records.map((r) => this.toDto(r));
    }
    async getActiveKekVersion() {
        const kek = await this.prisma.kekVersion.findFirst({
            where: { active: true },
            orderBy: { id: 'desc' },
        });
        return kek?.id ?? 1;
    }
    async rotateKek() {
        await this.prisma.kekVersion.updateMany({
            where: { active: true },
            data: { active: false },
        });
        const newKek = await this.prisma.kekVersion.create({
            data: { active: true },
        });
        return { id: newKek.id };
    }
    toDto(record) {
        return {
            id: record.id,
            document_id: record.document_id,
            version: record.version,
            object_key: record.object_key,
            checksum: record.checksum,
            signature: record.signature,
            kek_version: record.kek_version,
            scan_status: record.scan_status,
            scan_result: record.scan_result,
            file_size: record.file_size,
            mime_type: record.mime_type,
            created_at: record.created_at.toISOString(),
        };
    }
};
exports.SecurityPipelineService = SecurityPipelineService;
exports.SecurityPipelineService = SecurityPipelineService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [document_security_prisma_service_1.DocumentSecurityPrismaService])
], SecurityPipelineService);
//# sourceMappingURL=security-pipeline.service.js.map