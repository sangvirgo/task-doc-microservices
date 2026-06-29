"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObservabilityModule = void 0;
const common_1 = require("@nestjs/common");
const correlation_id_middleware_1 = require("./correlation/correlation-id.middleware");
const health_module_1 = require("./health/health.module");
const structured_logger_service_1 = require("./logging/structured-logger.service");
let ObservabilityModule = class ObservabilityModule {
    configure(consumer) {
        consumer.apply(correlation_id_middleware_1.CorrelationIdMiddleware).forRoutes('*path');
    }
};
exports.ObservabilityModule = ObservabilityModule;
exports.ObservabilityModule = ObservabilityModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [health_module_1.HealthModule],
        providers: [structured_logger_service_1.StructuredLogger],
        exports: [structured_logger_service_1.StructuredLogger, health_module_1.HealthModule],
    })
], ObservabilityModule);
//# sourceMappingURL=observability.module.js.map