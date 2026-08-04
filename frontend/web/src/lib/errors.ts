export class GatewayError extends Error {
  constructor(public readonly status: number, message: string, public readonly correlationId?: string) { super(message); }
}

export async function toGatewayError(response: Response): Promise<GatewayError> {
  const correlationId = response.headers.get('x-correlation-id') ?? undefined;
  let message = 'The request could not be completed.';
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const candidate = (body as { message?: unknown }).message;
      message = Array.isArray(candidate) ? candidate.join(', ') : typeof candidate === 'string' ? candidate : message;
    }
  } catch { /* Gateway response may be empty. */ }
  const safeMessages: Record<number, string> = { 401: 'Your session is no longer valid.', 403: 'You do not have permission to do that.', 404: 'The requested resource was not found.', 409: 'This item changed. Refresh and try again.', 413: 'The uploaded file is too large.', 415: 'That file type is not supported.', 429: 'Too many requests. Try again shortly.', 503: 'The service is temporarily unavailable.' };
  return new GatewayError(response.status, safeMessages[response.status] ?? message, correlationId);
}
