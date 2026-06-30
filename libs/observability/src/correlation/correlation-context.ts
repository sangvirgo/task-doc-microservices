import { AsyncLocalStorage } from 'node:async_hooks';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

export interface CorrelationStore {
  correlationId: string;
}

const storage = new AsyncLocalStorage<CorrelationStore>();

/**
 * Run `callback` with `correlationId` attached to the async context, so that anything logged
 * beneath it — however deep, and across awaits — carries the same id without being passed it.
 */
export function runWithCorrelationId<T>(correlationId: string, callback: () => T): T {
  return storage.run({ correlationId }, callback);
}

/** The correlation id of the current async context, or `undefined` outside a request. */
export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
