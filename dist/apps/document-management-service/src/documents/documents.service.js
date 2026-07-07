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
exports.DocumentsService = void 0;
const common_1 = require("@nestjs/common");
const document_prisma_service_1 = require("../prisma/document-prisma.service");
let DocumentsService = class DocumentsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createDocument(data) {
        const document = await this.prisma.document.create({
            data: {
                title: data.title,
                document_type: data.document_type,
                owner_id: data.owner_id,
                creator_id: data.creator_id,
                security_level: data.security_level || 'INTERNAL',
                retention_policy: data.retention_policy || null,
            },
        });
        return this.toDto(document);
    }
    async getDocument(id) {
        const document = await this.prisma.document.findUnique({ where: { id } });
        if (!document)
            throw new common_1.NotFoundException('Document not found');
        return this.toDto(document);
    }
    async listDocuments(filters) {
        const documents = await this.prisma.document.findMany({ where: filters });
        return documents.map((d) => this.toDto(d));
    }
    async createDocumentVersion(data) {
        const document = await this.prisma.document.findUnique({ where: { id: data.document_id } });
        if (!document)
            throw new common_1.NotFoundException('Document not found');
        const nextVersion = document.current_version + 1;
        const version = await this.prisma.documentVersion.create({
            data: {
                document_id: data.document_id,
                version: nextVersion,
                object_key: data.object_key,
                checksum: data.checksum,
                kek_version: data.kek_version || 1,
                encrypted_dek: data.encrypted_dek,
                file_size: data.file_size,
                mime_type: data.mime_type,
                created_by: data.created_by,
            },
        });
        await this.prisma.document.update({
            where: { id: data.document_id },
            data: { current_version: nextVersion },
        });
        return this.versionToDto(version);
    }
    async getDocumentVersion(documentId, version) {
        const documentVersion = await this.prisma.documentVersion.findUnique({
            where: { document_id_version: { document_id: documentId, version } },
        });
        if (!documentVersion)
            throw new common_1.NotFoundException('Document version not found');
        return this.versionToDto(documentVersion);
    }
    async getDocumentVersions(documentId) {
        const document = await this.prisma.document.findUnique({ where: { id: documentId } });
        if (!document)
            throw new common_1.NotFoundException('Document not found');
        const versions = await this.prisma.documentVersion.findMany({
            where: { document_id: documentId },
            orderBy: { version: 'desc' },
        });
        return versions.map((v) => this.versionToDto(v));
    }
    async getDocumentPreview(documentId) {
        const document = await this.prisma.document.findUnique({ where: { id: documentId } });
        if (!document)
            throw new common_1.NotFoundException('Document not found');
        return {
            id: document.id,
            title: document.title,
            security_level: document.security_level,
            document_type: document.document_type,
        };
    }
    async createDownloadTicket(data) {
        const documentVersion = await this.prisma.documentVersion.findUnique({
            where: { document_id_version: { document_id: data.document_id, version: data.version } },
        });
        if (!documentVersion)
            throw new common_1.NotFoundException('Document version not found');
        const expires_at = new Date(Date.now() + data.expires_in_seconds * 1000);
        const ticket = await this.prisma.downloadTicket.create({
            data: {
                document_id: data.document_id,
                version: data.version,
                actor_id: data.actor_id,
                object_key: data.object_key,
                expires_at,
            },
        });
        return this.ticketToDto(ticket);
    }
    async createRecord(data) {
        const record = await this.prisma.record.create({
            data: {
                title: data.title,
                description: data.description || null,
                creator_id: data.creator_id,
                status: 'DRAFT',
            },
            include: { entries: true },
        });
        return this.recordToDto(record);
    }
    async getRecord(id) {
        const record = await this.prisma.record.findUnique({
            where: { id },
            include: { entries: true },
        });
        if (!record)
            throw new common_1.NotFoundException('Record not found');
        return this.recordToDto(record);
    }
    async listRecords(filters) {
        const records = await this.prisma.record.findMany({
            where: filters,
            include: { entries: true },
        });
        return records.map((r) => this.recordToDto(r));
    }
    async addDocumentToRecord(record_id, document_id, document_version_id) {
        const record = await this.prisma.record.findUnique({ where: { id: record_id } });
        if (!record)
            throw new common_1.NotFoundException('Record not found');
        if (record.status === 'SEALED')
            throw new common_1.BadRequestException('Record is sealed');
        const entry = await this.prisma.recordEntry.create({
            data: {
                record_id,
                document_id,
                document_version_id,
            },
        });
        return this.entryToDto(entry);
    }
    async sealRecord(record_id) {
        const record = await this.prisma.record.findUnique({
            where: { id: record_id },
            include: { entries: true },
        });
        if (!record)
            throw new common_1.NotFoundException('Record not found');
        if (record.entries.length === 0)
            throw new common_1.BadRequestException('Cannot seal empty record');
        const updated = await this.prisma.record.update({
            where: { id: record_id },
            data: { status: 'SEALED', sealed_at: new Date() },
            include: { entries: true },
        });
        return this.recordToDto(updated);
    }
    async createTransferPackage(data) {
        const record = await this.prisma.record.findUnique({ where: { id: data.record_id } });
        if (!record)
            throw new common_1.NotFoundException('Record not found');
        const pkg = await this.prisma.transferPackage.create({
            data: {
                record_id: data.record_id,
                submitter_id: data.submitter_id,
                status: 'DRAFT',
                manifest: data.manifest === undefined ? undefined : data.manifest,
                metadata: data.metadata === undefined ? undefined : data.metadata,
            },
        });
        return {
            id: pkg.id,
            record_id: pkg.record_id,
            status: pkg.status,
            submitted_at: pkg.submitted_at?.toISOString() ?? null,
        };
    }
    async submitTransferPackage(package_id) {
        const pkg = await this.prisma.transferPackage.findUnique({ where: { id: package_id } });
        if (!pkg)
            throw new common_1.NotFoundException('Transfer package not found');
        if (pkg.status !== 'DRAFT')
            throw new common_1.BadRequestException('Package must be in DRAFT status');
        const updated = await this.prisma.transferPackage.update({
            where: { id: package_id },
            data: { status: 'SUBMITTED', submitted_at: new Date() },
        });
        return {
            id: updated.id,
            status: updated.status,
            submitted_at: updated.submitted_at.toISOString(),
        };
    }
    async reviewTransferPackage(package_id, archivist_id, approved, rejection_reason) {
        const pkg = await this.prisma.transferPackage.findUnique({ where: { id: package_id } });
        if (!pkg)
            throw new common_1.NotFoundException('Transfer package not found');
        if (pkg.status !== 'SUBMITTED')
            throw new common_1.BadRequestException('Package must be SUBMITTED for review');
        const newStatus = approved ? 'ACCEPTED' : 'REJECTED';
        const updated = await this.prisma.transferPackage.update({
            where: { id: package_id },
            data: {
                status: newStatus,
                archivist_id,
                rejection_reason: rejection_reason || null,
                decided_at: new Date(),
            },
        });
        return {
            id: updated.id,
            status: updated.status,
            decided_at: updated.decided_at.toISOString(),
        };
    }
    toDto(document) {
        return {
            id: document.id,
            title: document.title,
            document_type: document.document_type,
            owner_id: document.owner_id,
            creator_id: document.creator_id,
            security_level: document.security_level,
            status: document.status,
            current_version: document.current_version,
            retention_policy: document.retention_policy,
            archive_status: document.archive_status,
            record_id: document.record_id,
            created_at: document.created_at.toISOString(),
            updated_at: document.updated_at.toISOString(),
        };
    }
    versionToDto(version) {
        return {
            id: version.id,
            document_id: version.document_id,
            version: version.version,
            object_key: version.object_key,
            file_size: version.file_size,
            mime_type: version.mime_type,
            created_by: version.created_by,
            created_at: version.created_at.toISOString(),
        };
    }
    ticketToDto(ticket) {
        return {
            id: ticket.id,
            document_id: ticket.document_id,
            version: ticket.version,
            actor_id: ticket.actor_id,
            expires_at: ticket.expires_at.toISOString(),
            object_key: ticket.object_key,
        };
    }
    recordToDto(record) {
        return {
            id: record.id,
            title: record.title,
            description: record.description,
            status: record.status,
            creator_id: record.creator_id,
            sealed_at: record.sealed_at?.toISOString() ?? null,
            created_at: record.created_at.toISOString(),
            updated_at: record.updated_at.toISOString(),
            entries: record.entries.map((e) => this.entryToDto(e)),
        };
    }
    entryToDto(entry) {
        return {
            id: entry.id,
            record_id: entry.record_id,
            document_id: entry.document_id,
            document_version_id: entry.document_version_id,
            added_at: entry.added_at.toISOString(),
        };
    }
};
exports.DocumentsService = DocumentsService;
exports.DocumentsService = DocumentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [document_prisma_service_1.DocumentPrismaService])
], DocumentsService);
//# sourceMappingURL=documents.service.js.map