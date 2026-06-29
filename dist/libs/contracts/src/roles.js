"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_ROLES = exports.SystemRole = void 0;
exports.isSystemRole = isSystemRole;
exports.SystemRole = {
    ADMIN: 'ADMIN',
    EMPLOYEE: 'EMPLOYEE',
};
exports.SYSTEM_ROLES = Object.values(exports.SystemRole);
function isSystemRole(value) {
    return exports.SYSTEM_ROLES.includes(value);
}
//# sourceMappingURL=roles.js.map