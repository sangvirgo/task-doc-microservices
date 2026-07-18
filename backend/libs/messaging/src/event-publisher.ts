import type { EventEnvelope } from '@c17/contracts';

/**
 * Publishes a domain event.
 *
 * An interface rather than a class so that a service under test can assert on what it published
 * without a broker, and so that the Outbox Pattern (V3 §8.2) can substitute a transactional
 * implementation without touching call sites.
 */
export interface EventPublisher {
  publish(envelope: EventEnvelope): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

/** Records what it was asked to publish. For tests and for local runs without a broker. */
export class InMemoryEventPublisher implements EventPublisher {
  readonly published: EventEnvelope[] = [];

  publish(envelope: EventEnvelope): Promise<void> {
    this.published.push(envelope);
    return Promise.resolve();
  }

  clear(): void {
    this.published.length = 0;
  }
}
