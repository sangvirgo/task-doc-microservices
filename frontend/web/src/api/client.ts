import { clearSession, readSession, writeSession } from '@/auth/session';
import { createCorrelationId } from '@/lib/correlation';
import { GatewayError, toGatewayError } from '@/lib/errors';
import type { TokenPair } from '@/types/auth';
import type { PaginatedResponse, PaginationMeta } from '@/types/pagination';

let refreshPromise: Promise<TokenPair> | null = null;
const apiUrl = (path: string) => `/gateway${path}`;

const PUBLIC_AUTH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/verify-email',
  '/auth/resend-otp',
];
const needsAuthHeader = (path: string) => !PUBLIC_AUTH_PATHS.some((p) => path.startsWith(p));

const GET_CACHE_TTL_MS = 3_000;
const getCache = new Map<string, { expiresAt: number; promise: Promise<unknown> }>();

function cachedGet<T>(path: string, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = getCache.get(path);
  if (hit && hit.expiresAt > now) return hit.promise as Promise<T>;
  if (hit) getCache.delete(path);
  const promise = fetcher().catch((error) => { getCache.delete(path); throw error; });
  getCache.set(path, { expiresAt: now + GET_CACHE_TTL_MS, promise });
  return promise;
}

const invalidateGetCache = () => getCache.clear();

async function request<T>(path: string, init: RequestInit = {}, retryAfterRefresh = true): Promise<T> {
  const session = readSession();
  const headers = new Headers(init.headers);
  headers.set('x-correlation-id', createCorrelationId());
  headers.set('accept', 'application/json');
  if (session && needsAuthHeader(path)) headers.set('authorization', `Bearer ${session.access_token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(apiUrl(path), { ...init, headers, signal: init.signal });
  if (response.status === 401 && retryAfterRefresh && session && needsAuthHeader(path)) {
    try { await refreshSession(session.refresh_token); return request<T>(path, init, false); } catch { clearSession(); window.location.assign('/login?reason=session-expired'); throw new GatewayError(401, 'Your session is no longer valid.'); }
  }
  if (!response.ok) throw await toGatewayError(response);
  if ((init.method ?? 'GET').toUpperCase() !== 'GET') invalidateGetCache();
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function refreshSession(refreshToken: string): Promise<TokenPair> {
  refreshPromise ??= request<TokenPair>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }, false).then((tokens) => { writeSession(tokens); return tokens; }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function normalizeList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const envelope = payload as Record<string, unknown>;
    for (const key of ['items', 'data', 'results']) {
      const candidate = envelope[key];
      if (Array.isArray(candidate)) return candidate as T[];
      if (candidate && typeof candidate === 'object') {
        const nested = candidate as Record<string, unknown>;
        if (Array.isArray(nested.items)) return nested.items as T[];
      }
    }
  }
  throw new GatewayError(502, 'Gateway returned an invalid list response.');
}

function normalizePage<T>(payload: unknown): PaginatedResponse<T> {
  if (!payload || typeof payload !== 'object') {
    throw new GatewayError(502, 'Gateway returned an invalid paginated response.');
  }

  const envelope = payload as Record<string, unknown>;
  const items = envelope.items;
  const pagination = envelope.pagination;
  if (!Array.isArray(items) || !pagination || typeof pagination !== 'object') {
    throw new GatewayError(502, 'Gateway returned an invalid paginated response.');
  }

  const metadata = pagination as Record<string, unknown>;
  if (typeof metadata.page !== 'number' || typeof metadata.page_size !== 'number') {
    throw new GatewayError(502, 'Gateway returned invalid pagination metadata.');
  }

  const normalized: PaginationMeta = {
    page: metadata.page,
    page_size: metadata.page_size,
    ...(typeof metadata.total === 'number' ? { total: metadata.total } : {}),
    ...(typeof metadata.total_pages === 'number' ? { total_pages: metadata.total_pages } : {}),
    has_next: metadata.has_next === true,
  };
  return { items, pagination: normalized } as PaginatedResponse<T>;
}

export const gatewayClient = {
  get: <T>(path: string, signal?: AbortSignal) => signal ? request<T>(path, { signal }) : cachedGet<T>(`GET ${path}`, () => request<T>(path, {})),
  getList: <T>(path: string, signal?: AbortSignal) => signal ? request<unknown>(path, { signal }).then(normalizeList<T>) : cachedGet<T[]>(`LIST ${path}`, () => request<unknown>(path, {}).then(normalizeList<T>)),
  getPage: <T>(path: string, signal?: AbortSignal) => signal ? request<unknown>(path, { signal }).then(normalizePage<T>) : cachedGet<PaginatedResponse<T>>(`PAGE ${path}`, () => request<unknown>(path, {}).then(normalizePage<T>)),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
  postForm: <T>(path: string, body: FormData, signal?: AbortSignal) => request<T>(path, { method: 'POST', body, signal }),
  postFormWithProgress: <T>(path: string, body: FormData, onProgress: (percent: number) => void) => requestFormWithProgress<T>(path, body, onProgress),
  getBlob: (path: string) => requestBlob(path, undefined, 'GET'),
  postBlob: (path: string, body: unknown) => requestBlob(path, body, 'POST'),
};

async function requestFormWithProgress<T>(path: string, body: FormData, onProgress: (percent: number) => void, retryAfterRefresh = true): Promise<T> {
  const session = readSession();
  const response = await new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(path));
    xhr.timeout = 120_000;
    xhr.setRequestHeader('accept', 'application/json');
    xhr.setRequestHeader('x-correlation-id', createCorrelationId());
    if (session) xhr.setRequestHeader('authorization', `Bearer ${session.access_token}`);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    xhr.onerror = () => reject(new GatewayError(503, 'The service is temporarily unavailable.'));
    xhr.ontimeout = () => reject(new GatewayError(503, 'Document upload timed out after 120 seconds.'));
    xhr.onload = () => resolve(new Response(xhr.responseText, { status: xhr.status, headers: { 'content-type': xhr.getResponseHeader('content-type') ?? 'application/json', 'x-correlation-id': xhr.getResponseHeader('x-correlation-id') ?? '' } }));
    xhr.send(body);
  });
  if (response.status === 401 && retryAfterRefresh && session) {
    try { await refreshSession(session.refresh_token); return requestFormWithProgress(path, body, onProgress, false); } catch { clearSession(); window.location.assign('/login?reason=session-expired'); throw new GatewayError(401, 'Your session is no longer valid.'); }
  }
  if (!response.ok) throw await toGatewayError(response);
  return response.json() as Promise<T>;
}

async function requestBlob(path: string, body: unknown, method: 'GET' | 'POST'): Promise<Blob> {
  const session = readSession();
  const headers = new Headers({ 'x-correlation-id': createCorrelationId(), accept: 'application/octet-stream', 'content-type': 'application/json' });
  if (session) headers.set('authorization', `Bearer ${session.access_token}`);
  const response = await fetch(apiUrl(path), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 401 && session) {
    try {
      await refreshSession(session.refresh_token);
      return requestBlob(path, body, method);
    } catch {
      clearSession();
      window.location.assign('/login?reason=session-expired');
      throw new GatewayError(401, 'Your session is no longer valid.');
    }
  }
  if (!response.ok) throw await toGatewayError(response);
  return response.blob();
}
