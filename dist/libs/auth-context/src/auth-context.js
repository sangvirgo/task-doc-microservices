"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdmin = isAdmin;
exports.hasCapability = hasCapability;
function isAdmin(auth) {
    return auth.role === 'ADMIN';
}
function hasCapability(auth, capability) {
    return auth.capabilities.includes(capability);
}
//# sourceMappingURL=auth-context.js.map