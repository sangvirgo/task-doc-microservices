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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("@nestjs/config");
let RedisService = class RedisService {
    configService;
    client;
    constructor(configService) {
        this.configService = configService;
    }
    onModuleInit() {
        this.client = new ioredis_1.default(this.configService.get('REDIS_URL') || 'redis://localhost:6379');
    }
    async onModuleDestroy() {
        await this.client.quit();
    }
    getClient() {
        return this.client;
    }
    async setSession(sessionId, metadata, ttlSeconds) {
        await this.client.setex(`session:${sessionId}`, ttlSeconds, JSON.stringify(metadata));
    }
    async getSession(sessionId) {
        const data = await this.client.get(`session:${sessionId}`);
        return data ? JSON.parse(data) : null;
    }
    async deleteSession(sessionId) {
        await this.client.del(`session:${sessionId}`);
    }
    async deleteUserSessions(userId) {
        let cursor = '0';
        do {
            const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', 'session:*', 'COUNT', 100);
            cursor = nextCursor;
            for (const key of keys) {
                const data = await this.client.get(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (parsed.userId === userId) {
                        await this.client.del(key);
                    }
                }
            }
        } while (cursor !== '0');
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map