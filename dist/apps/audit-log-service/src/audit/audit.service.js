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
exports.AuditService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const audit_prisma_service_1 = require("../prisma/audit-prisma.service");
let AuditService = class AuditService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async appendEvent(event) {
        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.auditEvent.findUnique({ where: { id: event.event_id } });
            if (existing) {
                return {
                    current_hash: existing.current_hash,
                    sequence_number: existing.sequence_number,
                };
            }
            const chainHead = await tx.chainHead.upsert({
                where: { id: 'singleton' },
                create: { id: 'singleton', last_hash: '', sequence: 0 },
                update: {},
            });
            const canonicalPayload = this.canonicalJSON({
                event_id: event.event_id,
                event_type: event.event_type,
                occurred_at: event.occurred_at,
                actor_id: event.actor_id,
                resource_type: event.resource_type,
                resource_id: event.resource_id,
                payload: event.payload,
            });
            const currentHash = (0, crypto_1.createHash)('sha256')
                .update(canonicalPayload + chainHead.last_hash)
                .digest('hex');
            const sequenceNumber = chainHead.sequence + 1;
            await tx.auditEvent.create({
                data: {
                    id: event.event_id,
                    event_type: event.event_type,
                    occurred_at: new Date(event.occurred_at),
                    actor_id: event.actor_id,
                    resource_type: event.resource_type,
                    resource_id: event.resource_id,
                    payload: event.payload,
                    previous_hash: chainHead.last_hash,
                    current_hash: currentHash,
                    sequence_number: sequenceNumber,
                },
            });
            await tx.chainHead.update({
                where: { id: 'singleton' },
                data: {
                    last_hash: currentHash,
                    last_event_id: event.event_id,
                    sequence: sequenceNumber,
                },
            });
            return { current_hash: currentHash, sequence_number: sequenceNumber };
        });
    }
    async getChainHead() {
        const head = await this.prisma.chainHead.findUnique({ where: { id: 'singleton' } });
        if (!head) {
            return { last_hash: '', last_event_id: null, sequence: 0 };
        }
        return {
            last_hash: head.last_hash,
            last_event_id: head.last_event_id,
            sequence: head.sequence,
        };
    }
    async getEvent(eventId) {
        const event = await this.prisma.auditEvent.findUnique({ where: { id: eventId } });
        if (!event)
            return null;
        return this.toDto(event);
    }
    async listEvents(filters) {
        const events = await this.prisma.auditEvent.findMany({
            where: {
                event_type: filters?.event_type,
                actor_id: filters?.actor_id,
                resource_type: filters?.resource_type,
                resource_id: filters?.resource_id,
            },
            orderBy: { sequence_number: 'desc' },
            take: filters?.limit || 50,
            skip: filters?.offset || 0,
        });
        return events.map((e) => this.toDto(e));
    }
    async verifyChainIntegrity() {
        const events = await this.prisma.auditEvent.findMany({
            orderBy: { sequence_number: 'asc' },
        });
        if (events.length === 0)
            return { valid: true };
        let previousHash = '';
        for (const event of events) {
            const recomputedHash = (0, crypto_1.createHash)('sha256')
                .update(this.canonicalJSON({
                event_id: event.id,
                event_type: event.event_type,
                occurred_at: event.occurred_at.toISOString(),
                actor_id: event.actor_id,
                resource_type: event.resource_type,
                resource_id: event.resource_id,
                payload: event.payload,
            }) + previousHash)
                .digest('hex');
            if (recomputedHash !== event.current_hash) {
                return { valid: false, broken_at: event.sequence_number };
            }
            previousHash = event.current_hash;
        }
        return { valid: true };
    }
    canonicalJSON(obj) {
        const sorted = Object.keys(obj)
            .sort()
            .reduce((acc, key) => {
            acc[key] = obj[key];
            return acc;
        }, {});
        return JSON.stringify(sorted);
    }
    toDto(event) {
        return {
            id: event.id,
            event_type: event.event_type,
            occurred_at: event.occurred_at.toISOString(),
            actor_id: event.actor_id,
            resource_type: event.resource_type,
            resource_id: event.resource_id,
            payload: event.payload,
            previous_hash: event.previous_hash,
            current_hash: event.current_hash,
            sequence_number: event.sequence_number,
            created_at: event.created_at.toISOString(),
        };
    }
};
exports.AuditService = AuditService;
exports.AuditService = AuditService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [audit_prisma_service_1.AuditPrismaService])
], AuditService);
//# sourceMappingURL=audit.service.js.map