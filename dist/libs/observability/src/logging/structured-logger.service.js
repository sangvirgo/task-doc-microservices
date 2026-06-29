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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StructuredLogger = exports.REDACTED_PATHS = void 0;
exports.createPinoLogger = createPinoLogger;
const common_1 = require("@nestjs/common");
const pino_1 = __importDefault(require("pino"));
const config_1 = require("../../../config/src");
const correlation_context_1 = require("../correlation/correlation-context");
exports.REDACTED_PATHS = [
    'password',
    'passwordHash',
    'password_hash',
    'token',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'authorization',
    'req.headers.authorization',
    'req.headers.cookie',
    'dek',
    'kek',
    'wrappedDek',
    'wrapped_dek',
    'content',
    'comment',
    '*.password',
    '*.token',
    '*.refresh_token',
];
function createPinoLogger(serviceName, level = process.env.LOG_LEVEL ?? 'info') {
    return (0, pino_1.default)({
        level,
        base: { service: serviceName },
        redact: { paths: exports.REDACTED_PATHS, censor: '[REDACTED]' },
        timestamp: pino_1.default.stdTimeFunctions.isoTime,
        formatters: {
            level: (label) => ({ level: label }),
        },
    });
}
let StructuredLogger = class StructuredLogger {
    logger;
    context;
    constructor(serviceName) {
        this.logger = createPinoLogger(serviceName ?? 'unknown-service');
    }
    setContext(context) {
        this.context = context;
    }
    log(message, context) {
        this.logger.info(this.bindings(context), asMessage(message));
    }
    error(message, stack, context) {
        this.logger.error({ ...this.bindings(context), stack }, asMessage(message));
    }
    warn(message, context) {
        this.logger.warn(this.bindings(context), asMessage(message));
    }
    debug(message, context) {
        this.logger.debug(this.bindings(context), asMessage(message));
    }
    verbose(message, context) {
        this.logger.trace(this.bindings(context), asMessage(message));
    }
    fatal(message, context) {
        this.logger.fatal(this.bindings(context), asMessage(message));
    }
    bindings(context) {
        return {
            context: context ?? this.context,
            correlation_id: (0, correlation_context_1.getCorrelationId)(),
        };
    }
};
exports.StructuredLogger = StructuredLogger;
exports.StructuredLogger = StructuredLogger = __decorate([
    (0, common_1.Injectable)({ scope: common_1.Scope.DEFAULT }),
    __param(0, (0, common_1.Optional)()),
    __param(0, (0, common_1.Inject)(config_1.SERVICE_NAME)),
    __metadata("design:paramtypes", [String])
], StructuredLogger);
function asMessage(message) {
    return typeof message === 'string' ? message : JSON.stringify(message);
}
//# sourceMappingURL=structured-logger.service.js.map