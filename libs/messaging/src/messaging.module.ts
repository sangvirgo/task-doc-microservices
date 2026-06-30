import { DynamicModule, Module } from '@nestjs/common';

import { AmqpEventPublisher, RABBITMQ_URL } from './amqp-event-publisher';
import { EVENT_PUBLISHER, InMemoryEventPublisher } from './event-publisher';

export interface MessagingModuleOptions {
  /** AMQP connection string. */
  url: string;
  /**
   * When true, publishes are recorded in memory instead of sent to a broker. For tests and for
   * running one service locally without RabbitMQ.
   */
  inMemory?: boolean;
}

@Module({})
export class MessagingModule {
  static forRoot(options: MessagingModuleOptions): DynamicModule {
    if (options.inMemory) {
      return {
        module: MessagingModule,
        providers: [{ provide: EVENT_PUBLISHER, useClass: InMemoryEventPublisher }],
        exports: [EVENT_PUBLISHER],
      };
    }

    return {
      module: MessagingModule,
      providers: [
        { provide: RABBITMQ_URL, useValue: options.url },
        AmqpEventPublisher,
        { provide: EVENT_PUBLISHER, useExisting: AmqpEventPublisher },
      ],
      exports: [EVENT_PUBLISHER],
    };
  }
}
