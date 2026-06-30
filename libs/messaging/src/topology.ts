/**
 * RabbitMQ topology. Names live here so a producer and a consumer cannot disagree about them.
 */

/** The single topic exchange every domain event is published to. */
export const DOMAIN_EXCHANGE = 'c17.domain';

/** The dead-letter exchange every work queue routes to after retries are exhausted. */
export const DEAD_LETTER_EXCHANGE = 'c17.dlx';

/** Queue naming: one queue per consuming service per concern. */
export function queueName(consumer: string, concern: string): string {
  return `${consumer}.${concern}`;
}

/** Every work queue has exactly one dead-letter queue, named after it. */
export function deadLetterQueueName(queue: string): string {
  return `${queue}.dlq`;
}

/** Routing key for a dead-lettered message, so a DLQ can be drained per source queue. */
export function deadLetterRoutingKey(queue: string): string {
  return `dlq.${queue}`;
}
