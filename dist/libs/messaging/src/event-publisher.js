"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryEventPublisher = exports.EVENT_PUBLISHER = void 0;
exports.EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
class InMemoryEventPublisher {
    published = [];
    publish(envelope) {
        this.published.push(envelope);
        return Promise.resolve();
    }
    clear() {
        this.published.length = 0;
    }
}
exports.InMemoryEventPublisher = InMemoryEventPublisher;
//# sourceMappingURL=event-publisher.js.map