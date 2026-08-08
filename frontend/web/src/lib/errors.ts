export class GatewayError extends Error {
  constructor(public readonly status: number, message: string, public readonly correlationId?: string) { super(message); }
}

function readableError(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const parts = value.map(readableError).filter((item): item is string => Boolean(item));
    return parts.length > 0 ? parts.join(', ') : null;
  }
  if (value && typeof value === 'object') {
    const issue = value as { message?: unknown; path?: unknown };
    const detail = readableError(issue.message);
    if (!detail) return null;
    const path = Array.isArray(issue.path) ? issue.path.map(String).filter(Boolean).join('.') : '';
    return path ? `${path}: ${detail}` : detail;
  }
  return null;
}

export async function toGatewayError(response: Response): Promise<GatewayError> {
  const correlationId = response.headers.get('x-correlation-id') ?? undefined;
  let message = 'The request could not be completed.';
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const candidate = readableError((body as { message?: unknown }).message);
      if (candidate) message = candidate;
    }
  } catch { /* Gateway response may be empty. */ }
  const safeMessages: Record<number, string> = { 403: 'You do not have permission to do that.', 404: 'The requested resource was not found.', 409: 'This item changed. Refresh and try again.', 413: 'The uploaded file is too large.', 415: 'That file type is not supported.', 429: 'Too many requests. Try again shortly.', 503: 'The service is temporarily unavailable.' };
  return new GatewayError(response.status, safeMessages[response.status] ?? message, correlationId);
}
