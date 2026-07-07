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
exports.TransferPackagesController = exports.RecordsController = exports.DocumentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const crypto_1 = require("crypto");
const auth_context_1 = require("@c17/auth-context");
const contracts_1 = require("@c17/contracts");
const messaging_1 = require("@c17/messaging");
const documents_service_1 = require("./documents.service");
const permission_client_1 = require("../permissions/permission.client");
const audit_client_1 = require("../audit/audit.client");
const security_client_1 = require("../security/security.client");
const createDocumentSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    document_type: zod_1.z.string().min(1),
    owner_id: zod_1.z.string().uuid(),
    security_level: zod_1.z.string().default('INTERNAL'),
    retention_policy: zod_1.z.string().optional(),
});
const documentVersionSchema = zod_1.z.object({
    object_key: zod_1.z.string().min(1),
    checksum: zod_1.z.string().min(1),
    encrypted_dek: zod_1.z.string().min(1),
    file_size: zod_1.z.number().int().positive(),
    mime_type: zod_1.z.string().min(1),
    kek_version: zod_1.z.number().int().positive().optional(),
});
const downloadTicketSchema = zod_1.z.object({
    version: zod_1.z.number().int().positive(),
    expires_in_seconds: zod_1.z.number().int().positive().default(3600),
});
const createRecordSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
});
const recordEntrySchema = zod_1.z.object({
    document_id: zod_1.z.string().uuid(),
    document_version_id: zod_1.z.string().uuid(),
});
const transferPackageSchema = zod_1.z.object({
    manifest: zod_1.z.record(zod_1.z.unknown()).optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
const reviewPackageSchema = zod_1.z.object({
    approved: zod_1.z.boolean(),
    rejection_reason: zod_1.z.string().optional(),
});
let DocumentsController = class DocumentsController {
    documentsService;
    permissionClient;
    auditClient;
    securityClient;
    eventPublisher;
    constructor(documentsService, permissionClient, auditClient, securityClient, eventPublisher) {
        this.documentsService = documentsService;
        this.permissionClient = permissionClient;
        this.auditClient = auditClient;
        this.securityClient = securityClient;
        this.eventPublisher = eventPublisher;
    }
    async listDocuments(owner_id, creator_id, status) {
        return this.documentsService.listDocuments({ owner_id, creator_id, status });
    }
    async createDocument(body, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const parsed = createDocumentSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        return this.documentsService
            .createDocument({
            title: parsed.data.title,
            document_type: parsed.data.document_type,
            owner_id: parsed.data.owner_id,
            creator_id: user.userId,
            security_level: parsed.data.security_level,
            retention_policy: parsed.data.retention_policy,
        })
            .then(async (doc) => {
            await this.auditClient.record({
                event_type: 'DOCUMENT_CREATED',
                actor_id: user.userId,
                resource_type: 'DOCUMENT',
                resource_id: doc.id,
                payload: {
                    title: doc.title,
                    document_type: doc.document_type,
                    security_level: doc.security_level,
                },
            });
            void this.eventPublisher.publish((0, contracts_1.buildEventEnvelope)({
                event_id: (0, crypto_1.randomUUID)(),
                event_type: 'document.created',
                occurred_at: new Date().toISOString(),
                producer: 'document-management-service',
                correlation_id: (0, crypto_1.randomUUID)(),
                actor_id: user.userId,
                resource_type: 'DOCUMENT',
                resource_id: doc.id,
                payload: { title: doc.title, document_type: doc.document_type },
            }));
            return doc;
        });
    }
    async getDocument(documentId, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const permCheck = await this.permissionClient.check({
            actor_id: user.userId,
            actor_role: user.role,
            resource_type: 'DOCUMENT',
            resource_id: documentId,
            action: 'PREVIEW',
        });
        if (!permCheck.allowed) {
            throw new common_1.ForbiddenException(`Document access denied: ${permCheck.reason_code}`);
        }
        return this.documentsService.getDocument(documentId);
    }
    async getDocumentPreview(documentId, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const permCheck = await this.permissionClient.check({
            actor_id: user.userId,
            actor_role: user.role,
            resource_type: 'DOCUMENT',
            resource_id: documentId,
            action: 'PREVIEW',
        });
        if (!permCheck.allowed) {
            throw new common_1.ForbiddenException(`Document access denied: ${permCheck.reason_code}`);
        }
        return this.documentsService.getDocumentPreview(documentId);
    }
    async createVersion(documentId, body, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const parsed = documentVersionSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        const version = await this.documentsService.createDocumentVersion({
            document_id: documentId,
            object_key: parsed.data.object_key,
            checksum: parsed.data.checksum,
            encrypted_dek: parsed.data.encrypted_dek,
            file_size: parsed.data.file_size,
            mime_type: parsed.data.mime_type,
            kek_version: parsed.data.kek_version,
            created_by: user.userId,
        });
        void this.securityClient.processDocument({
            document_id: documentId,
            version: version.version,
            object_key: parsed.data.object_key,
            checksum: parsed.data.checksum,
            encrypted_dek: parsed.data.encrypted_dek,
            file_size: parsed.data.file_size,
            mime_type: parsed.data.mime_type,
            kek_version: parsed.data.kek_version,
        });
        return version;
    }
    async getVersions(documentId) {
        return this.documentsService.getDocumentVersions(documentId);
    }
    async getVersion(documentId, version) {
        const versionNum = parseInt(version, 10);
        if (isNaN(versionNum))
            throw new common_1.BadRequestException('Invalid version number');
        return this.documentsService.getDocumentVersion(documentId, versionNum);
    }
    async createDownloadTicket(documentId, body, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const parsed = downloadTicketSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        const permCheck = await this.permissionClient.check({
            actor_id: user.userId,
            actor_role: user.role,
            resource_type: 'DOCUMENT',
            resource_id: documentId,
            action: 'DOWNLOAD',
        });
        if (!permCheck.allowed) {
            throw new common_1.ForbiddenException(`Download denied: ${permCheck.reason_code}`);
        }
        const version = await this.documentsService.getDocumentVersion(documentId, parsed.data.version);
        return this.documentsService
            .createDownloadTicket({
            document_id: documentId,
            version: parsed.data.version,
            actor_id: user.userId,
            object_key: version.object_key,
            expires_in_seconds: parsed.data.expires_in_seconds,
        })
            .then(async (ticket) => {
            await this.auditClient.record({
                event_type: 'DOCUMENT_DOWNLOAD_TICKET',
                actor_id: user.userId,
                resource_type: 'DOCUMENT',
                resource_id: documentId,
                payload: { version: parsed.data.version, ticket_id: ticket.id },
            });
            return ticket;
        });
    }
    async getDocumentDownload(documentId, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const permCheck = await this.permissionClient.check({
            actor_id: user.userId,
            actor_role: user.role,
            resource_type: 'DOCUMENT',
            resource_id: documentId,
            action: 'DOWNLOAD',
        });
        if (!permCheck.allowed) {
            throw new common_1.ForbiddenException(`Download denied: ${permCheck.reason_code}`);
        }
        const document = await this.documentsService.getDocument(documentId);
        const version = await this.documentsService.getDocumentVersion(documentId, document.current_version);
        return this.documentsService.createDownloadTicket({
            document_id: documentId,
            version: document.current_version,
            actor_id: user.userId,
            object_key: version.object_key,
            expires_in_seconds: 3600,
        });
    }
};
exports.DocumentsController = DocumentsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List documents' }),
    __param(0, (0, common_1.Query)('owner_id')),
    __param(1, (0, common_1.Query)('creator_id')),
    __param(2, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], DocumentsController.prototype, "listDocuments", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new document' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0, Object]),
    __metadata("design:returntype", Promise)
], DocumentsController.prototype, "createDocument", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get document metadata' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], DocumentsController.prototype, "getDocument", null);
__decorate([
    (0, common_1.Get)(':id/preview'),
    (0, swagger_1.ApiOperation)({ summary: 'Get document preview' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], DocumentsController.prototype, "getDocumentPreview", null);
__decorate([
    (0, common_1.Post)(':id/versions'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new document version' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0, Object]),
    __metadata("design:returntype", Promise)
], DocumentsController.prototype, "createVersion", null);
__decorate([
    (0, common_1.Get)(':id/versions'),
    (0, swagger_1.ApiOperation)({ summary: 'List document versions' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DocumentsController.prototype, "getVersions", null);
__decorate([
    (0, common_1.Get)(':id/versions/:version'),
    (0, swagger_1.ApiOperation)({ summary: 'Get specific document version' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('version')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], DocumentsController.prototype, "getVersion", null);
__decorate([
    (0, common_1.Post)(':id/download-ticket'),
    (0, swagger_1.ApiOperation)({ summary: 'Create download ticket (requires DOWNLOAD permission)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0, Object]),
    __metadata("design:returntype", Promise)
], DocumentsController.prototype, "createDownloadTicket", null);
__decorate([
    (0, common_1.Get)(':id/download'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get download ticket for current version (deprecated, use /download-ticket)',
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], DocumentsController.prototype, "getDocumentDownload", null);
exports.DocumentsController = DocumentsController = __decorate([
    (0, swagger_1.ApiTags)('documents'),
    (0, common_1.Controller)('documents'),
    __param(4, (0, common_1.Inject)(messaging_1.EVENT_PUBLISHER)),
    __metadata("design:paramtypes", [documents_service_1.DocumentsService,
        permission_client_1.PermissionClient,
        audit_client_1.AuditClient,
        security_client_1.SecurityClient, Object])
], DocumentsController);
let RecordsController = class RecordsController {
    documentsService;
    constructor(documentsService) {
        this.documentsService = documentsService;
    }
    async listRecords(creator_id, status) {
        return this.documentsService.listRecords({ creator_id, status });
    }
    async createRecord(body, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const parsed = createRecordSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        return this.documentsService.createRecord({
            title: parsed.data.title,
            description: parsed.data.description,
            creator_id: user.userId,
        });
    }
    async getRecord(recordId) {
        return this.documentsService.getRecord(recordId);
    }
    async addEntry(recordId, body, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const parsed = recordEntrySchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        return this.documentsService.addDocumentToRecord(recordId, parsed.data.document_id, parsed.data.document_version_id);
    }
    async sealRecord(recordId, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        return this.documentsService.sealRecord(recordId);
    }
};
exports.RecordsController = RecordsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List records' }),
    __param(0, (0, common_1.Query)('creator_id')),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "listRecords", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new record' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0, Object]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "createRecord", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get record by ID' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "getRecord", null);
__decorate([
    (0, common_1.Post)(':id/entries'),
    (0, swagger_1.ApiOperation)({ summary: 'Add document to record' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0, Object]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "addEntry", null);
__decorate([
    (0, common_1.Post)(':id/seal'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Seal record (no more edits allowed)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RecordsController.prototype, "sealRecord", null);
exports.RecordsController = RecordsController = __decorate([
    (0, swagger_1.ApiTags)('records'),
    (0, common_1.Controller)('records'),
    __metadata("design:paramtypes", [documents_service_1.DocumentsService])
], RecordsController);
let TransferPackagesController = class TransferPackagesController {
    documentsService;
    constructor(documentsService) {
        this.documentsService = documentsService;
    }
    async createPackage(body, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const parsed = transferPackageSchema.extend({ record_id: zod_1.z.string().uuid() }).safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        return this.documentsService.createTransferPackage({
            record_id: parsed.data.record_id,
            submitter_id: user.userId,
            manifest: parsed.data.manifest,
            metadata: parsed.data.metadata,
        });
    }
    async submitPackage(packageId, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        return this.documentsService.submitTransferPackage(packageId);
    }
    async reviewPackage(packageId, body, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const parsed = reviewPackageSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        return this.documentsService.reviewTransferPackage(packageId, user.userId, parsed.data.approved, parsed.data.rejection_reason);
    }
};
exports.TransferPackagesController = TransferPackagesController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create transfer package' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TransferPackagesController.prototype, "createPackage", null);
__decorate([
    (0, common_1.Post)(':id/submit'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Submit package for archival' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TransferPackagesController.prototype, "submitPackage", null);
__decorate([
    (0, common_1.Post)(':id/review'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Review transfer package (archivist action)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0, Object]),
    __metadata("design:returntype", Promise)
], TransferPackagesController.prototype, "reviewPackage", null);
exports.TransferPackagesController = TransferPackagesController = __decorate([
    (0, swagger_1.ApiTags)('transfer-packages'),
    (0, common_1.Controller)('transfer-packages'),
    __metadata("design:paramtypes", [documents_service_1.DocumentsService])
], TransferPackagesController);
//# sourceMappingURL=documents.controller.js.map