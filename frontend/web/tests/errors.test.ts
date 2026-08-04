import { describe, expect, it } from 'vitest';
import { toGatewayError } from '@/lib/errors';

describe('Gateway error normalization', () => {
  it('uses a safe status message and retains only the correlation ID', async () => {
    const error = await toGatewayError(new Response(JSON.stringify({ message: 'internal implementation detail' }), { status: 503, headers: { 'content-type': 'application/json', 'x-correlation-id': 'support-123' } }));
    expect(error.message).toBe('The service is temporarily unavailable.');
    expect(error.correlationId).toBe('support-123');
  });
  it('normalizes permission denial without exposing a raw envelope', async () => {
    const error = await toGatewayError(new Response(JSON.stringify({ message: 'forbidden internals' }), { status: 403, headers: { 'content-type': 'application/json' } }));
    expect(error.message).toBe('You do not have permission to do that.');
  });
  it.each([
    [404, 'The requested resource was not found.'], [409, 'This item changed. Refresh and try again.'], [413, 'The uploaded file is too large.'], [415, 'That file type is not supported.'], [429, 'Too many requests. Try again shortly.'],
  ])('normalizes status %i', async (status, message) => {
    await expect(toGatewayError(new Response('{}', { status, headers: { 'content-type': 'application/json' } }))).resolves.toMatchObject({ status, message });
  });
});
