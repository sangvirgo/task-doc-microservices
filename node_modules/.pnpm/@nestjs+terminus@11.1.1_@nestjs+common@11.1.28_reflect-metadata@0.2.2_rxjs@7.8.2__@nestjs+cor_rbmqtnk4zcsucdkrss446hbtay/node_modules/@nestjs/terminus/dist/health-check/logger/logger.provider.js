"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLoggerProvider = getLoggerProvider;
const common_1 = require("@nestjs/common");
const noop_logger_1 = require("./noop-logger");
const terminus_constants_1 = require("../../terminus.constants");
function getLoggerProvider(logger) {
    // Enable logging
    if (logger === true || logger === undefined) {
        return {
            provide: terminus_constants_1.TERMINUS_LOGGER,
            useClass: common_1.Logger,
        };
    }
    // Disable logging
    if (logger === false) {
        return {
            provide: terminus_constants_1.TERMINUS_LOGGER,
            useValue: noop_logger_1.NOOP_LOGGER,
        };
    }
    // Custom logger
    return {
        provide: terminus_constants_1.TERMINUS_LOGGER,
        useClass: logger,
    };
}
//# sourceMappingURL=logger.provider.js.map