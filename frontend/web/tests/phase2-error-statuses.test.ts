import { afterEach, expect, it, vi } from 'vitest';
import { gatewayClient } from '@/api/client';
import { clearSession, writeSession } from '@/auth/session';

const safeToken = `header.${btoa(JSON.stringify({ role: 'EMPLOYEE', sub: '00000000-0000-4000-8000-000000000001' }))}.signature`;
function mockStatus(status: number) { writeSession({ access_token: safeToken, refresh_token: 'refresh', expires_in_seconds: 1800 }); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ statusCode: status }), { status, headers: { 'content-type': 'application/json', 'x-correlation-id': 'test-correlation' } }))); }
afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

it('Task handles 401', async () => { mockStatus(401); await expect(gatewayClient.get('/tasks')).rejects.toMatchObject({ status: 401 }); });
it('Task handles 403', async () => { mockStatus(403); await expect(gatewayClient.get('/tasks')).rejects.toMatchObject({ status: 403 }); });
it('Task handles 404', async () => { mockStatus(404); await expect(gatewayClient.get('/tasks/missing')).rejects.toMatchObject({ status: 404 }); });
it('Task handles 409', async () => { mockStatus(409); await expect(gatewayClient.get('/tasks')).rejects.toMatchObject({ status: 409 }); });
it('Task handles 413', async () => { mockStatus(413); await expect(gatewayClient.get('/tasks')).rejects.toMatchObject({ status: 413 }); });
it('Task handles 415', async () => { mockStatus(415); await expect(gatewayClient.get('/tasks')).rejects.toMatchObject({ status: 415 }); });
it('Task handles 429', async () => { mockStatus(429); await expect(gatewayClient.get('/tasks')).rejects.toMatchObject({ status: 429 }); });
it('Task handles 503', async () => { mockStatus(503); await expect(gatewayClient.get('/tasks')).rejects.toMatchObject({ status: 503 }); });

it('Comment handles 401', async () => { mockStatus(401); await expect(gatewayClient.get('/tasks/x/comments')).rejects.toMatchObject({ status: 401 }); });
it('Comment handles 403', async () => { mockStatus(403); await expect(gatewayClient.get('/tasks/x/comments')).rejects.toMatchObject({ status: 403 }); });
it('Comment handles 404', async () => { mockStatus(404); await expect(gatewayClient.get('/tasks/x/comments')).rejects.toMatchObject({ status: 404 }); });
it('Comment handles 409', async () => { mockStatus(409); await expect(gatewayClient.get('/tasks/x/comments')).rejects.toMatchObject({ status: 409 }); });
it('Comment handles 413', async () => { mockStatus(413); await expect(gatewayClient.get('/tasks/x/comments')).rejects.toMatchObject({ status: 413 }); });
it('Comment handles 415', async () => { mockStatus(415); await expect(gatewayClient.get('/tasks/x/comments')).rejects.toMatchObject({ status: 415 }); });
it('Comment handles 429', async () => { mockStatus(429); await expect(gatewayClient.get('/tasks/x/comments')).rejects.toMatchObject({ status: 429 }); });
it('Comment handles 503', async () => { mockStatus(503); await expect(gatewayClient.get('/tasks/x/comments')).rejects.toMatchObject({ status: 503 }); });

it('Document handles 401', async () => { mockStatus(401); await expect(gatewayClient.get('/documents')).rejects.toMatchObject({ status: 401 }); });
it('Document handles 403', async () => { mockStatus(403); await expect(gatewayClient.get('/documents')).rejects.toMatchObject({ status: 403 }); });
it('Document handles 404', async () => { mockStatus(404); await expect(gatewayClient.get('/documents/missing')).rejects.toMatchObject({ status: 404 }); });
it('Document handles 409', async () => { mockStatus(409); await expect(gatewayClient.get('/documents')).rejects.toMatchObject({ status: 409 }); });
it('Document handles 413', async () => { mockStatus(413); await expect(gatewayClient.get('/documents')).rejects.toMatchObject({ status: 413 }); });
it('Document handles 415', async () => { mockStatus(415); await expect(gatewayClient.get('/documents')).rejects.toMatchObject({ status: 415 }); });
it('Document handles 429', async () => { mockStatus(429); await expect(gatewayClient.get('/documents')).rejects.toMatchObject({ status: 429 }); });
it('Document handles 503', async () => { mockStatus(503); await expect(gatewayClient.get('/documents')).rejects.toMatchObject({ status: 503 }); });
