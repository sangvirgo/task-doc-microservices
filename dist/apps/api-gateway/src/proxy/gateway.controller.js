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
exports.GatewayController = void 0;
const common_1 = require("@nestjs/common");
const observability_1 = require("../../../../libs/observability/src");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
function getRoutes() {
    return [
        { prefix: '/api/auth', target: `http://localhost:${process.env.AUTH_SERVICE_PORT || '3001'}` },
        { prefix: '/api/users', target: `http://localhost:${process.env.USER_ROLE_SERVICE_PORT || '3002'}` },
        { prefix: '/api/tasks', target: `http://localhost:${process.env.TASK_SERVICE_PORT || '3003'}` },
        { prefix: '/api/documents', target: `http://localhost:${process.env.DOCUMENT_SERVICE_PORT || '3004'}` },
        { prefix: '/api/records', target: `http://localhost:${process.env.DOCUMENT_SERVICE_PORT || '3004'}` },
        { prefix: '/api/transfer-packages', target: `http://localhost:${process.env.DOCUMENT_SERVICE_PORT || '3004'}` },
        { prefix: '/api/security', target: `http://localhost:${process.env.DOCUMENT_SECURITY_PORT || '3005'}` },
        { prefix: '/api/permissions', target: `http://localhost:${process.env.PERMISSION_SERVICE_PORT || '3006'}` },
        { prefix: '/api/audit', target: `http://localhost:${process.env.AUDIT_SERVICE_PORT || '3007'}` },
        { prefix: '/api/notifications', target: `http://localhost:${process.env.NOTIFICATION_SERVICE_PORT || '3008'}` },
        { prefix: '/api/monitoring', target: `http://localhost:${process.env.SECURITY_MONITORING_PORT || '3009'}` },
    ];
}
const DEFAULT_TIMEOUT_MS = Number(process.env.GATEWAY_TIMEOUT_MS || 10_000);
let GatewayController = class GatewayController {
    logger = new common_1.Logger('GatewayController');
    routes = getRoutes();
    async proxyAuth(req, res) {
        await this.proxy(req, res);
    }
    async proxyUsers(req, res) {
        await this.proxy(req, res);
    }
    async proxyTasks(req, res) {
        await this.proxy(req, res);
    }
    async proxyDocuments(req, res) {
        await this.proxy(req, res);
    }
    async proxyRecords(req, res) {
        await this.proxy(req, res);
    }
    async proxyTransferPackages(req, res) {
        await this.proxy(req, res);
    }
    async proxySecurity(req, res) {
        await this.proxy(req, res);
    }
    async proxyPermissions(req, res) {
        await this.proxy(req, res);
    }
    async proxyAudit(req, res) {
        await this.proxy(req, res);
    }
    async proxyNotifications(req, res) {
        await this.proxy(req, res);
    }
    async proxyMonitoring(req, res) {
        await this.proxy(req, res);
    }
    async proxy(req, res) {
        const route = this.routes.find((r) => req.originalUrl.startsWith(r.prefix));
        if (!route) {
            res.status(404).json({ statusCode: 404, message: 'Route not found' });
            return;
        }
        try {
            const targetPath = req.originalUrl.slice(route.prefix.length) || '/';
            const targetUrl = `${route.target}${targetPath}`;
            const headers = {};
            if (req.headers['content-type'])
                headers['content-type'] = req.headers['content-type'];
            if (req.headers['accept'])
                headers['accept'] = req.headers['accept'];
            if (req.headers['authorization'])
                headers['authorization'] = req.headers['authorization'];
            const correlationId = (0, observability_1.getCorrelationId)();
            if (correlationId)
                headers['x-correlation-id'] = correlationId;
            const user = req['user'];
            if (user) {
                headers['x-user-id'] = user.userId;
                headers['x-user-role'] = user.role;
                headers['x-user-capabilities'] = JSON.stringify(user.capabilities);
            }
            let body;
            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body) {
                body = JSON.stringify(req.body);
            }
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
            let response;
            try {
                response = await fetch(targetUrl, {
                    method: req.method,
                    headers,
                    body,
                    signal: controller.signal,
                });
            }
            finally {
                clearTimeout(timeout);
            }
            const status = this.mapStatus(response.status);
            const contentType = response.headers.get('content-type');
            if (contentType)
                res.setHeader('content-type', contentType);
            const upstreamCorrelation = response.headers.get('x-correlation-id');
            if (upstreamCorrelation)
                res.setHeader('x-correlation-id', upstreamCorrelation);
            const responseBody = await response.text();
            res.status(status).send(responseBody);
        }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                this.logger.warn(`Proxy timeout: ${req.method} ${req.originalUrl}`);
                throw new common_1.ServiceUnavailableException('Upstream service timeout');
            }
            if (error instanceof common_1.ForbiddenException)
                throw error;
            if (error instanceof common_1.ServiceUnavailableException)
                throw error;
            this.logger.error(`Proxy error: ${req.method} ${req.originalUrl} — ${error instanceof Error ? error.message : 'unknown'}`);
            throw new common_1.ServiceUnavailableException('Upstream service unavailable');
        }
    }
    mapStatus(status) {
        if (status === 403)
            return 403;
        if (status >= 500)
            return 503;
        return status;
    }
};
exports.GatewayController = GatewayController;
__decorate([
    (0, jwt_auth_guard_1.Public)(),
    (0, common_1.All)('api/auth/*path'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "proxyAuth", null);
__decorate([
    (0, common_1.All)('api/users/*path'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "proxyUsers", null);
__decorate([
    (0, common_1.All)('api/tasks/*path'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "proxyTasks", null);
__decorate([
    (0, common_1.All)('api/documents/*path'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "proxyDocuments", null);
__decorate([
    (0, common_1.All)('api/records/*path'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "proxyRecords", null);
__decorate([
    (0, common_1.All)('api/transfer-packages/*path'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "proxyTransferPackages", null);
__decorate([
    (0, common_1.All)('api/security/*path'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "proxySecurity", null);
__decorate([
    (0, common_1.All)('api/permissions/*path'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "proxyPermissions", null);
__decorate([
    (0, common_1.All)('api/audit/*path'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "proxyAudit", null);
__decorate([
    (0, common_1.All)('api/notifications/*path'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "proxyNotifications", null);
__decorate([
    (0, common_1.All)('api/monitoring/*path'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "proxyMonitoring", null);
exports.GatewayController = GatewayController = __decorate([
    (0, common_1.Controller)()
], GatewayController);
//# sourceMappingURL=gateway.controller.js.map