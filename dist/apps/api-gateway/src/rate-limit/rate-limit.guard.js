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
exports.RateLimitGuard = void 0;
const common_1 = require("@nestjs/common");
let RateLimitGuard = class RateLimitGuard {
    windowMs;
    maxRequests;
    buckets = new Map();
    constructor() {
        this.windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
        this.maxRequests = Number(process.env.RATE_LIMIT_MAX || 100);
        setInterval(() => this.cleanup(), 60_000).unref();
    }
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const key = this.getKey(request);
        const now = Date.now();
        const windowStart = now - this.windowMs;
        let timestamps = this.buckets.get(key);
        if (!timestamps) {
            timestamps = [];
            this.buckets.set(key, timestamps);
        }
        while (timestamps.length > 0 && timestamps[0] < windowStart) {
            timestamps.shift();
        }
        if (timestamps.length >= this.maxRequests) {
            throw new common_1.HttpException({
                statusCode: common_1.HttpStatus.TOO_MANY_REQUESTS,
                message: 'Too many requests',
                retryAfter: Math.ceil(this.windowMs / 1000),
            }, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        timestamps.push(now);
        return true;
    }
    getKey(request) {
        const user = request['user'];
        if (user?.userId)
            return `user:${user.userId}`;
        return `ip:${request.ip || request.socket.remoteAddress || 'unknown'}`;
    }
    cleanup() {
        const cutoff = Date.now() - this.windowMs;
        for (const [key, timestamps] of this.buckets) {
            while (timestamps.length > 0 && timestamps[0] < cutoff) {
                timestamps.shift();
            }
            if (timestamps.length === 0) {
                this.buckets.delete(key);
            }
        }
    }
};
exports.RateLimitGuard = RateLimitGuard;
exports.RateLimitGuard = RateLimitGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RateLimitGuard);
//# sourceMappingURL=rate-limit.guard.js.map