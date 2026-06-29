"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEAD_LETTER_EXCHANGE = exports.DOMAIN_EXCHANGE = void 0;
exports.queueName = queueName;
exports.deadLetterQueueName = deadLetterQueueName;
exports.deadLetterRoutingKey = deadLetterRoutingKey;
exports.DOMAIN_EXCHANGE = 'c17.domain';
exports.DEAD_LETTER_EXCHANGE = 'c17.dlx';
function queueName(consumer, concern) {
    return `${consumer}.${concern}`;
}
function deadLetterQueueName(queue) {
    return `${queue}.dlq`;
}
function deadLetterRoutingKey(queue) {
    return `dlq.${queue}`;
}
//# sourceMappingURL=topology.js.map