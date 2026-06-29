"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AppConfigModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppConfigModule = exports.SERVICE_NAME = exports.APP_ENV = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const validate_env_1 = require("./validate-env");
exports.APP_ENV = Symbol('APP_ENV');
exports.SERVICE_NAME = Symbol('SERVICE_NAME');
let AppConfigModule = AppConfigModule_1 = class AppConfigModule {
    static forRoot(options) {
        const env = (0, validate_env_1.validateEnv)(options.serviceName, options.schema, options.source);
        return {
            module: AppConfigModule_1,
            imports: [config_1.ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
            providers: [
                { provide: exports.APP_ENV, useValue: env },
                { provide: exports.SERVICE_NAME, useValue: options.serviceName },
            ],
            exports: [exports.APP_ENV, exports.SERVICE_NAME],
        };
    }
};
exports.AppConfigModule = AppConfigModule;
exports.AppConfigModule = AppConfigModule = AppConfigModule_1 = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({})
], AppConfigModule);
//# sourceMappingURL=app-config.module.js.map