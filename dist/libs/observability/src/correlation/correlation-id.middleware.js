"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CorrelationIdMiddleware = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const correlation_context_1 = require("./correlation-context");
let CorrelationIdMiddleware = class CorrelationIdMiddleware {
    use(req, res, next) {
        const inbound = req.header(correlation_context_1.CORRELATION_ID_HEADER);
        const correlationId = isUuid(inbound) ? inbound : (0, node_crypto_1.randomUUID)();
        res.setHeader(correlation_context_1.CORRELATION_ID_HEADER, correlationId);
        (0, correlation_context_1.runWithCorrelationId)(correlationId, () => next());
    }
};
exports.CorrelationIdMiddleware = CorrelationIdMiddleware;
exports.CorrelationIdMiddleware = CorrelationIdMiddleware = __decorate([
    (0, common_1.Injectable)()
], CorrelationIdMiddleware);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(value) {
    return value !== undefined && UUID_PATTERN.test(value);
}
//# sourceMappingURL=correlation-id.middleware.js.map