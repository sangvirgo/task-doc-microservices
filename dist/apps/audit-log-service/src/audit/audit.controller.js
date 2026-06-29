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
exports.AuditController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const audit_service_1 = require("./audit.service");
const appendEventSchema = zod_1.z.object({
    event_id: zod_1.z.string().uuid(),
    event_type: zod_1.z.string().min(1),
    occurred_at: zod_1.z.string().datetime(),
    actor_id: zod_1.z.string().uuid().nullable(),
    resource_type: zod_1.z.string().min(1),
    resource_id: zod_1.z.string().min(1),
    payload: zod_1.z.record(zod_1.z.unknown()),
});
let AuditController = class AuditController {
    auditService;
    constructor(auditService) {
        this.auditService = auditService;
    }
    async appendEvent(body) {
        const parsed = appendEventSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        return this.auditService.appendEvent(parsed.data);
    }
    async listEvents(event_type, actor_id, resource_type, resource_id, limit, offset) {
        return this.auditService.listEvents({
            event_type,
            actor_id,
            resource_type,
            resource_id,
            limit: limit ? parseInt(limit, 10) : undefined,
            offset: offset ? parseInt(offset, 10) : undefined,
        });
    }
    async getEvent(id) {
        const event = await this.auditService.getEvent(id);
        if (!event)
            throw new common_1.NotFoundException('Audit event not found');
        return event;
    }
    async getChainHead() {
        return this.auditService.getChainHead();
    }
    async verifyChain() {
        return this.auditService.verifyChainIntegrity();
    }
};
exports.AuditController = AuditController;
__decorate([
    (0, common_1.Post)('events'),
    (0, swagger_1.ApiOperation)({ summary: 'Append an audit event to the hash chain' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", Promise)
], AuditController.prototype, "appendEvent", null);
__decorate([
    (0, common_1.Get)('events'),
    (0, swagger_1.ApiOperation)({ summary: 'List audit events with filters' }),
    __param(0, (0, common_1.Query)('event_type')),
    __param(1, (0, common_1.Query)('actor_id')),
    __param(2, (0, common_1.Query)('resource_type')),
    __param(3, (0, common_1.Query)('resource_id')),
    __param(4, (0, common_1.Query)('limit')),
    __param(5, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], AuditController.prototype, "listEvents", null);
__decorate([
    (0, common_1.Get)('events/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get an audit event by id' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AuditController.prototype, "getEvent", null);
__decorate([
    (0, common_1.Get)('chain/head'),
    (0, swagger_1.ApiOperation)({ summary: 'Get the current hash chain head' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AuditController.prototype, "getChainHead", null);
__decorate([
    (0, common_1.Post)('chain/verify'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Verify hash chain integrity' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AuditController.prototype, "verifyChain", null);
exports.AuditController = AuditController = __decorate([
    (0, swagger_1.ApiTags)('audit'),
    (0, common_1.Controller)('audit'),
    __metadata("design:paramtypes", [audit_service_1.AuditService])
], AuditController);
//# sourceMappingURL=audit.controller.js.map