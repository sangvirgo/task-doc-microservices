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
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const notification_prisma_service_1 = require("../prisma/notification-prisma.service");
let NotificationsService = class NotificationsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createNotification(data) {
        const notification = await this.prisma.notification.create({
            data: {
                recipient_id: data.recipient_id,
                type: data.type,
                title: data.title,
                body: data.body,
                channel: data.channel || 'IN_APP',
                metadata: data.metadata,
            },
        });
        return this.toDto(notification);
    }
    async getNotification(id) {
        const notification = await this.prisma.notification.findUnique({ where: { id } });
        if (!notification)
            throw new common_1.NotFoundException('Notification not found');
        return this.toDto(notification);
    }
    async listNotifications(recipient_id, unread_only) {
        const notifications = await this.prisma.notification.findMany({
            where: {
                recipient_id,
                ...(unread_only ? { read_at: null } : {}),
            },
            orderBy: { created_at: 'desc' },
        });
        return notifications.map((n) => this.toDto(n));
    }
    async markAsRead(id) {
        const notification = await this.prisma.notification.findUnique({ where: { id } });
        if (!notification)
            throw new common_1.NotFoundException('Notification not found');
        const updated = await this.prisma.notification.update({
            where: { id },
            data: { read_at: new Date() },
        });
        return this.toDto(updated);
    }
    async markAllAsRead(recipient_id) {
        const result = await this.prisma.notification.updateMany({
            where: { recipient_id, read_at: null },
            data: { read_at: new Date() },
        });
        return { count: result.count };
    }
    async getPreferences(user_id) {
        const prefs = await this.prisma.notificationPreference.upsert({
            where: { user_id },
            create: { user_id, email_enabled: true, in_app_enabled: true },
            update: {},
        });
        return { id: prefs.id, user_id: prefs.user_id, email_enabled: prefs.email_enabled, in_app_enabled: prefs.in_app_enabled };
    }
    async updatePreferences(user_id, data) {
        const prefs = await this.prisma.notificationPreference.upsert({
            where: { user_id },
            create: {
                user_id,
                email_enabled: data.email_enabled ?? true,
                in_app_enabled: data.in_app_enabled ?? true,
            },
            update: {
                ...(data.email_enabled !== undefined ? { email_enabled: data.email_enabled } : {}),
                ...(data.in_app_enabled !== undefined ? { in_app_enabled: data.in_app_enabled } : {}),
            },
        });
        return { id: prefs.id, user_id: prefs.user_id, email_enabled: prefs.email_enabled, in_app_enabled: prefs.in_app_enabled };
    }
    toDto(notification) {
        return {
            id: notification.id,
            recipient_id: notification.recipient_id,
            type: notification.type,
            title: notification.title,
            body: notification.body,
            channel: notification.channel,
            read_at: notification.read_at?.toISOString() ?? null,
            metadata: notification.metadata,
            created_at: notification.created_at.toISOString(),
        };
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [notification_prisma_service_1.NotificationPrismaService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map