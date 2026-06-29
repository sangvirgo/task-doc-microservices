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
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const notifications_service_1 = require("./notifications.service");
const createNotificationSchema = zod_1.z.object({
    recipient_id: zod_1.z.string().uuid(),
    type: zod_1.z.string().min(1),
    title: zod_1.z.string().min(1),
    body: zod_1.z.string().min(1),
    channel: zod_1.z.enum(['IN_APP', 'EMAIL']).default('IN_APP'),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
const updatePreferencesSchema = zod_1.z.object({
    email_enabled: zod_1.z.boolean().optional(),
    in_app_enabled: zod_1.z.boolean().optional(),
});
let NotificationsController = class NotificationsController {
    notificationsService;
    constructor(notificationsService) {
        this.notificationsService = notificationsService;
    }
    async create(body) {
        const parsed = createNotificationSchema.safeParse(body);
        if (!parsed.success)
            throw new common_1.BadRequestException(parsed.error.issues);
        return this.notificationsService.createNotification(parsed.data);
    }
    async getOne(id) {
        return this.notificationsService.getNotification(id);
    }
    async list(recipient_id, unread_only) {
        if (!recipient_id)
            throw new common_1.BadRequestException('recipient_id query param is required');
        return this.notificationsService.listNotifications(recipient_id, unread_only === 'true');
    }
    async markAsRead(id) {
        return this.notificationsService.markAsRead(id);
    }
    async markAllAsRead(body) {
        if (!body.recipient_id)
            throw new common_1.BadRequestException('recipient_id is required');
        return this.notificationsService.markAllAsRead(body.recipient_id);
    }
    async getPreferences(userId) {
        return this.notificationsService.getPreferences(userId);
    }
    async updatePreferences(userId, body) {
        const parsed = updatePreferencesSchema.safeParse(body);
        if (!parsed.success)
            throw new common_1.BadRequestException(parsed.error.issues);
        return this.notificationsService.updatePreferences(userId, parsed.data);
    }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a notification' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a notification by ID' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "getOne", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List notifications for a recipient' }),
    __param(0, (0, common_1.Query)('recipient_id')),
    __param(1, (0, common_1.Query)('unread_only')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(':id/read'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Mark a notification as read' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "markAsRead", null);
__decorate([
    (0, common_1.Post)('read-all'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Mark all notifications as read for a recipient' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "markAllAsRead", null);
__decorate([
    (0, common_1.Get)('preferences/:userId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get notification preferences' }),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "getPreferences", null);
__decorate([
    (0, common_1.Put)('preferences/:userId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update notification preferences' }),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "updatePreferences", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, swagger_1.ApiTags)('notifications'),
    (0, common_1.Controller)('notifications'),
    __metadata("design:paramtypes", [notifications_service_1.NotificationsService])
], NotificationsController);
//# sourceMappingURL=notifications.controller.js.map