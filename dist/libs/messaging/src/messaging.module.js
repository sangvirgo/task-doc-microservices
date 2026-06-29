"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MessagingModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagingModule = void 0;
const common_1 = require("@nestjs/common");
const amqp_event_publisher_1 = require("./amqp-event-publisher");
const event_publisher_1 = require("./event-publisher");
let MessagingModule = MessagingModule_1 = class MessagingModule {
    static forRoot(options) {
        if (options.inMemory) {
            return {
                module: MessagingModule_1,
                providers: [{ provide: event_publisher_1.EVENT_PUBLISHER, useClass: event_publisher_1.InMemoryEventPublisher }],
                exports: [event_publisher_1.EVENT_PUBLISHER],
            };
        }
        return {
            module: MessagingModule_1,
            providers: [
                { provide: amqp_event_publisher_1.RABBITMQ_URL, useValue: options.url },
                amqp_event_publisher_1.AmqpEventPublisher,
                { provide: event_publisher_1.EVENT_PUBLISHER, useExisting: amqp_event_publisher_1.AmqpEventPublisher },
            ],
            exports: [event_publisher_1.EVENT_PUBLISHER],
        };
    }
};
exports.MessagingModule = MessagingModule;
exports.MessagingModule = MessagingModule = MessagingModule_1 = __decorate([
    (0, common_1.Module)({})
], MessagingModule);
//# sourceMappingURL=messaging.module.js.map