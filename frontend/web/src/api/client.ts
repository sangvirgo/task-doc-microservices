import { clearSession, readSession, writeSession } from '@/auth/session';
import { createCorrelationId } from '@/lib/correlation';
import { GatewayError, toGatewayError } from '@/lib/errors';
import type { TokenPair } from '@/types/auth';

let refreshPromise: Promise<TokenPair> | null = null;

async function request<T>(path: string, init: RequestInit = {}, retryAfterRefresh = true): Promise<T> {
  const session = readSession();
  const headers = new Headers(init.headers);
  headers.set('x-correlation-id', createCorrelationId());
  headers.set('accept', 'application/json');
  if (session && !path.startsWith('/auth/')) headers.set('authorization', `Bearer ${session.access_token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`/gateway${path}`, { ...init, headers, signal: init.signal });
  if (response.status === 401 && retryAfterRefresh && session && !path.startsWith('/auth/')) {
    try { await refreshSession(session.refresh_token); return request<T>(path, init, false); } catch { clearSession(); window.location.assign('/login?reason=session-expired'); throw new GatewayError(401, 'Your session is no longer valid.'); }
  }
  if (!response.ok) throw await toGatewayError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function refreshSession(refreshToken: string): Promise<TokenPair> {
  refreshPromise ??= request<TokenPair>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }, false).then((tokens) => { writeSession(tokens); return tokens; }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export const gatewayClient = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
  postForm: <T>(path: string, body: FormData, signal?: AbortSignal) => request<T>(path, { method: 'POST', body, signal }),
  postFormWithProgress: <T>(path: string, body: FormData, onProgress: (percent: number) => void) => requestFormWithProgress<T>(path, body, onProgress),
  postBlob: (path: string, body: unknown) => requestBlob(path, body),
};

async function requestFormWithProgress<T>(path: string, body: FormData, onProgress: (percent: number) => void, retryAfterRefresh = true): Promise<T> {
  const session = readSession();
  const response = await new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/gateway${path}`);
    xhr.setRequestHeader('accept', 'application/json');
    xhr.setRequestHeader('x-correlation-id', createCorrelationId());
    if (session) xhr.setRequestHeader('authorization', `Bearer ${session.access_token}`);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    xhr.onerror = () => reject(new GatewayError(503, 'The service is temporarily unavailable.'));
    xhr.onload = () => resolve(new Response(xhr.responseText, { status: xhr.status, headers: { 'content-type': xhr.getResponseHeader('content-type') ?? 'application/json', 'x-correlation-id': xhr.getResponseHeader('x-correlation-id') ?? '' } }));
    xhr.send(body);
  });
  if (response.status === 401 && retryAfterRefresh && session) {
    try { await refreshSession(session.refresh_token); return requestFormWithProgress(path, body, onProgress, false); } catch { clearSession(); window.location.assign('/login?reason=session-expired'); throw new GatewayError(401, 'Your session is no longer valid.'); }
  }
  if (!response.ok) throw await toGatewayError(response);
  return response.json() as Promise<T>;
}

async function requestBlob(path: string, body: unknown): Promise<Blob> {
  const session = readSession();
  const headers = new Headers({ 'x-correlation-id': createCorrelationId(), accept: 'application/octet-stream' });
  if (session) headers.set('authorization', `Bearer ${session.access_token}`);
  const response = await fetch(`/gateway${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (response.status === 401 && session) {
    try {
      await refreshSession(session.refresh_token);
      return requestBlob(path, body);
    } catch {
      clearSession();
      window.location.assign('/login?reason=session-expired');
      throw new GatewayError(401, 'Your session is no longer valid.');
    }
  }
  if (!response.ok) throw await toGatewayError(response);
  return response.blob();
}
