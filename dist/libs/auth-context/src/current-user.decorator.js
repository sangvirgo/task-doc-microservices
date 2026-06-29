"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentUser = exports.AUTH_CONTEXT_PROPERTY = void 0;
const common_1 = require("@nestjs/common");
exports.AUTH_CONTEXT_PROPERTY = 'authContext';
exports.CurrentUser = (0, common_1.createParamDecorator)((_data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    const auth = request[exports.AUTH_CONTEXT_PROPERTY];
    if (!auth) {
        throw new common_1.UnauthorizedException('No authenticated caller on this request');
    }
    return auth;
});
//# sourceMappingURL=current-user.decorator.js.map