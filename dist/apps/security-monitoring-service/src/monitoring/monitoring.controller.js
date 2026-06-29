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
exports.MonitoringController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const monitoring_service_1 = require("./monitoring.service");
const recordEventSchema = zod_1.z.object({
    rule_id: zod_1.z.string().uuid(),
    actor_id: zod_1.z.string().uuid(),
});
const createRuleSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    rule_type: zod_1.z.string().min(1),
    threshold: zod_1.z.number().int().positive().optional(),
    window_minutes: zod_1.z.number().int().positive().optional(),
    action: zod_1.z.enum(['ALERT', 'BLOCK']).optional(),
});
const resolveAlertSchema = zod_1.z.object({
    resolved_by: zod_1.z.string().uuid(),
});
const toggleRuleSchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
});
let MonitoringController = class MonitoringController {
    monitoringService;
    constructor(monitoringService) {
        this.monitoringService = monitoringService;
    }
    async recordEvent(body) {
        const parsed = recordEventSchema.safeParse(body);
        if (!parsed.success)
            throw new common_1.BadRequestException(parsed.error.issues);
        return this.monitoringService.recordEvent(parsed.data.rule_id, parsed.data.actor_id);
    }
    async listAlerts(status, severity, actor_id, rule_id) {
        return this.monitoringService.listAlerts({ status, severity, actor_id, rule_id });
    }
    async getAlert(id) {
        return this.monitoringService.getAlert(id);
    }
    async resolveAlert(id, body) {
        const parsed = resolveAlertSchema.safeParse(body);
        if (!parsed.success)
            throw new common_1.BadRequestException(parsed.error.issues);
        return this.monitoringService.resolveAlert(id, parsed.data.resolved_by);
    }
    async createRule(body) {
        const parsed = createRuleSchema.safeParse(body);
        if (!parsed.success)
            throw new common_1.BadRequestException(parsed.error.issues);
        return this.monitoringService.createRule(parsed.data);
    }
    async listRules() {
        return this.monitoringService.listRules();
    }
    async toggleRule(id, body) {
        const parsed = toggleRuleSchema.safeParse(body);
        if (!parsed.success)
            throw new common_1.BadRequestException(parsed.error.issues);
        return this.monitoringService.toggleRule(id, parsed.data.enabled);
    }
};
exports.MonitoringController = MonitoringController;
__decorate([
    (0, common_1.Post)('events'),
    (0, swagger_1.ApiOperation)({ summary: 'Record a security event against a rule' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "recordEvent", null);
__decorate([
    (0, common_1.Get)('alerts'),
    (0, swagger_1.ApiOperation)({ summary: 'List security alerts' }),
    __param(0, (0, common_1.Query)('status')),
    __param(1, (0, common_1.Query)('severity')),
    __param(2, (0, common_1.Query)('actor_id')),
    __param(3, (0, common_1.Query)('rule_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "listAlerts", null);
__decorate([
    (0, common_1.Get)('alerts/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a security alert by ID' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "getAlert", null);
__decorate([
    (0, common_1.Post)('alerts/:id/resolve'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Resolve a security alert' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "resolveAlert", null);
__decorate([
    (0, common_1.Post)('rules'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a security rule' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "createRule", null);
__decorate([
    (0, common_1.Get)('rules'),
    (0, swagger_1.ApiOperation)({ summary: 'List security rules' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "listRules", null);
__decorate([
    (0, common_1.Put)('rules/:id/toggle'),
    (0, swagger_1.ApiOperation)({ summary: 'Enable or disable a rule' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0]),
    __metadata("design:returntype", Promise)
], MonitoringController.prototype, "toggleRule", null);
exports.MonitoringController = MonitoringController = __decorate([
    (0, swagger_1.ApiTags)('monitoring'),
    (0, common_1.Controller)('monitoring'),
    __metadata("design:paramtypes", [monitoring_service_1.MonitoringService])
], MonitoringController);
//# sourceMappingURL=monitoring.controller.js.map