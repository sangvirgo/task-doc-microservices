"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = exports.envSchema = exports.SERVICE = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const config_1 = require("../../../libs/config/src");
const observability_1 = require("../../../libs/observability/src");
const messaging_1 = require("../../../libs/messaging/src");
const tasks_controller_1 = require("./tasks/tasks.controller");
const tasks_service_1 = require("./tasks/tasks.service");
const permission_client_1 = require("./permissions/permission.client");
const audit_client_1 = require("./audit/audit.client");
const task_prisma_service_1 = require("./prisma/task-prisma.service");
exports.SERVICE = 'task-management-service';
exports.envSchema = config_1.baseEnvSchema.extend({
    TASK_DATABASE_URL: zod_1.z.string().url(),
    PERMISSION_SERVICE_URL: zod_1.z.string().url().default('http://localhost:3006'),
    PERMISSION_CHECK_TIMEOUT_MS: zod_1.z.coerce.number().int().positive().default(2000),
    AUDIT_SERVICE_URL: zod_1.z.string().url().default('http://localhost:3007'),
    AUDIT_TIMEOUT_MS: zod_1.z.coerce.number().int().positive().default(2000),
    RABBITMQ_URL: zod_1.z.string().url().default('amqp://guest:guest@localhost:5672'),
});
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.AppConfigModule.forRoot({ serviceName: exports.SERVICE, schema: exports.envSchema }),
            observability_1.ObservabilityModule,
            messaging_1.MessagingModule.forRoot({
                url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
                inMemory: process.env.MESSAGING_IN_MEMORY === 'true',
            }),
        ],
        controllers: [tasks_controller_1.TasksController],
        providers: [task_prisma_service_1.TaskPrismaService, tasks_service_1.TasksService, permission_client_1.PermissionClient, audit_client_1.AuditClient],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map