"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmqpEventPublisher = exports.RABBITMQ_URL = void 0;
const common_1 = require("@nestjs/common");
const amqp_connection_manager_1 = __importDefault(require("amqp-connection-manager"));
const observability_1 = require("../../observability/src");
const topology_1 = require("./topology");
exports.RABBITMQ_URL = Symbol('RABBITMQ_URL');
let AmqpEventPublisher = class AmqpEventPublisher {
    url;
    logger;
    connection;
    channel;
    constructor(url, logger) {
        this.url = url;
        this.logger = logger;
    }
    onModuleInit() {
        this.connection = amqp_connection_manager_1.default.connect([this.url]);
        this.connection.on('connect', () => this.logger.log('RabbitMQ connected', 'AmqpEventPublisher'));
        this.connection.on('disconnect', ({ err }) => this.logger.warn(`RabbitMQ disconnected: ${err?.message ?? 'unknown'}`, 'AmqpEventPublisher'));
        this.channel = this.connection.createChannel({
            json: true,
            confirm: true,
            setup: async (channel) => {
                await channel.assertExchange(topology_1.DOMAIN_EXCHANGE, 'topic', { durable: true });
                await channel.assertExchange(topology_1.DEAD_LETTER_EXCHANGE, 'topic', { durable: true });
            },
        });
    }
    async publish(envelope) {
        if (!this.channel) {
            throw new Error('AmqpEventPublisher used before onModuleInit');
        }
        await this.channel.publish(topology_1.DOMAIN_EXCHANGE, envelope.event_type, envelope, {
            persistent: true,
            messageId: envelope.event_id,
            correlationId: envelope.correlation_id,
            contentType: 'application/json',
            timestamp: Date.parse(envelope.occurred_at),
        });
    }
    async onApplicationShutdown() {
        await this.channel?.close();
        await this.connection?.close();
    }
};
exports.AmqpEventPublisher = AmqpEventPublisher;
exports.AmqpEventPublisher = AmqpEventPublisher = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(exports.RABBITMQ_URL)),
    __metadata("design:paramtypes", [String, observability_1.StructuredLogger])
], AmqpEventPublisher);
//# sourceMappingURL=amqp-event-publisher.js.map