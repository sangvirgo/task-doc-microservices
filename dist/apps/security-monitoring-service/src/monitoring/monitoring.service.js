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
exports.MonitoringService = void 0;
const common_1 = require("@nestjs/common");
const security_monitoring_prisma_service_1 = require("../prisma/security-monitoring-prisma.service");
let MonitoringService = class MonitoringService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async recordEvent(rule_id, actor_id) {
        const rule = await this.prisma.securityRule.findUnique({ where: { id: rule_id } });
        if (!rule || !rule.enabled)
            return { triggered: false };
        const windowStart = new Date(Math.floor(Date.now() / (rule.window_minutes * 60_000)) * (rule.window_minutes * 60_000));
        const counter = await this.prisma.securityEventCounter.upsert({
            where: { rule_id_actor_id_window_start: { rule_id, actor_id, window_start: windowStart } },
            create: { rule_id, actor_id, window_start: windowStart, count: 1 },
            update: { count: { increment: 1 } },
        });
        if (counter.count >= rule.threshold) {
            const alert = await this.prisma.securityAlert.create({
                data: {
                    rule_id,
                    severity: rule.action === 'BLOCK' ? 'HIGH' : 'MEDIUM',
                    actor_id,
                    description: `Rule "${rule.name}" triggered: ${counter.count} events in ${rule.window_minutes}m window`,
                    metadata: { count: counter.count, threshold: rule.threshold },
                },
            });
            return { triggered: true, alert_id: alert.id };
        }
        return { triggered: false };
    }
    async listAlerts(filters) {
        const alerts = await this.prisma.securityAlert.findMany({
            where: {
                ...(filters?.status ? { status: filters.status } : {}),
                ...(filters?.severity ? { severity: filters.severity } : {}),
                ...(filters?.actor_id ? { actor_id: filters.actor_id } : {}),
                ...(filters?.rule_id ? { rule_id: filters.rule_id } : {}),
            },
            orderBy: { created_at: 'desc' },
        });
        return alerts.map((a) => this.toAlertDto(a));
    }
    async getAlert(id) {
        const alert = await this.prisma.securityAlert.findUnique({ where: { id } });
        if (!alert)
            throw new common_1.NotFoundException('Alert not found');
        return this.toAlertDto(alert);
    }
    async resolveAlert(id, resolved_by) {
        const alert = await this.prisma.securityAlert.findUnique({ where: { id } });
        if (!alert)
            throw new common_1.NotFoundException('Alert not found');
        const updated = await this.prisma.securityAlert.update({
            where: { id },
            data: { status: 'RESOLVED', resolved_at: new Date(), resolved_by },
        });
        return this.toAlertDto(updated);
    }
    async createRule(data) {
        const rule = await this.prisma.securityRule.create({
            data: {
                name: data.name,
                description: data.description || null,
                rule_type: data.rule_type,
                threshold: data.threshold ?? 5,
                window_minutes: data.window_minutes ?? 15,
                action: data.action ?? 'ALERT',
            },
        });
        return this.toRuleDto(rule);
    }
    async listRules() {
        const rules = await this.prisma.securityRule.findMany({ orderBy: { name: 'asc' } });
        return rules.map((r) => this.toRuleDto(r));
    }
    async toggleRule(id, enabled) {
        const rule = await this.prisma.securityRule.findUnique({ where: { id } });
        if (!rule)
            throw new common_1.NotFoundException('Rule not found');
        const updated = await this.prisma.securityRule.update({ where: { id }, data: { enabled } });
        return this.toRuleDto(updated);
    }
    toAlertDto(alert) {
        return {
            id: alert.id,
            rule_id: alert.rule_id,
            severity: alert.severity,
            actor_id: alert.actor_id,
            description: alert.description,
            metadata: alert.metadata,
            status: alert.status,
            resolved_at: alert.resolved_at?.toISOString() ?? null,
            resolved_by: alert.resolved_by,
            created_at: alert.created_at.toISOString(),
        };
    }
    toRuleDto(rule) {
        return {
            id: rule.id,
            name: rule.name,
            description: rule.description,
            rule_type: rule.rule_type,
            threshold: rule.threshold,
            window_minutes: rule.window_minutes,
            enabled: rule.enabled,
            action: rule.action,
            created_at: rule.created_at.toISOString(),
        };
    }
};
exports.MonitoringService = MonitoringService;
exports.MonitoringService = MonitoringService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [security_monitoring_prisma_service_1.SecurityMonitoringPrismaService])
], MonitoringService);
//# sourceMappingURL=monitoring.service.js.map