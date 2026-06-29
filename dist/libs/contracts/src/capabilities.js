"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTENT_ADJACENT_CAPABILITIES = exports.CAPABILITIES = exports.Capability = void 0;
exports.isCapability = isCapability;
exports.isContentAdjacentCapability = isContentAdjacentCapability;
exports.Capability = {
    ARCHIVE_SUBMIT: 'ARCHIVE_SUBMIT',
    ARCHIVE_RECEIVE: 'ARCHIVE_RECEIVE',
    DISPOSAL_APPROVE: 'DISPOSAL_APPROVE',
};
exports.CAPABILITIES = Object.values(exports.Capability);
exports.CONTENT_ADJACENT_CAPABILITIES = new Set([
    exports.Capability.ARCHIVE_SUBMIT,
    exports.Capability.ARCHIVE_RECEIVE,
    exports.Capability.DISPOSAL_APPROVE,
]);
function isCapability(value) {
    return exports.CAPABILITIES.includes(value);
}
function isContentAdjacentCapability(value) {
    return exports.CONTENT_ADJACENT_CAPABILITIES.has(value);
}
//# sourceMappingURL=capabilities.js.map