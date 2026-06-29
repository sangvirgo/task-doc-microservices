"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CORRELATION_ID_HEADER = void 0;
exports.runWithCorrelationId = runWithCorrelationId;
exports.getCorrelationId = getCorrelationId;
const node_async_hooks_1 = require("node:async_hooks");
exports.CORRELATION_ID_HEADER = 'x-correlation-id';
const storage = new node_async_hooks_1.AsyncLocalStorage();
function runWithCorrelationId(correlationId, callback) {
    return storage.run({ correlationId }, callback);
}
function getCorrelationId() {
    return storage.getStore()?.correlationId;
}
//# sourceMappingURL=correlation-context.js.map