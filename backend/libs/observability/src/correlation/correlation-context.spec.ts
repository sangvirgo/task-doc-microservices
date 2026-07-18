import { getCorrelationId, runWithCorrelationId } from './correlation-context';

describe('correlation context', () => {
  it('is undefined outside a request', () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it('survives awaits, so a deep async call still knows the request it belongs to', async () => {
    const seen = await runWithCorrelationId('abc', async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));
      return getCorrelationId();
    });

    expect(seen).toBe('abc');
  });

  it('keeps concurrent requests apart', async () => {
    const first = runWithCorrelationId('first', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return getCorrelationId();
    });
    const second = runWithCorrelationId('second', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return getCorrelationId();
    });

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
  });
});
