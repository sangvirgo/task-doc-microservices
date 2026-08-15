import { afterEach, expect, it, vi } from 'vitest';
import { retentionApi } from '@/api/retention';
import { clearSession, writeSession } from '@/auth/session';

const token = `header.${btoa(JSON.stringify({ role: 'EMPLOYEE', sub: '11111111-1111-4111-8111-111111111111' }))}.signature`;
afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

it('uses only public Gateway retention-disposal routes', async () => {
  writeSession({ access_token: token, refresh_token: 'refresh', expires_in_seconds: 1800 });
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } })));
  vi.stubGlobal('fetch', fetchMock);
  await retentionApi.holds(); await retentionApi.approvals(); await retentionApi.checkEligibility(); await retentionApi.placeHold('document-id', 'Legal review'); await retentionApi.approve('document-id', 'Retention elapsed'); await retentionApi.execute('document-id'); await retentionApi.releaseHold('hold-id');
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/gateway/retention-disposal/holds', '/gateway/retention-disposal/approvals', '/gateway/retention-disposal/check-eligibility', '/gateway/retention-disposal/holds', '/gateway/retention-disposal/approve-disposal', '/gateway/retention-disposal/execute-disposal', '/gateway/retention-disposal/holds/hold-id/release']);
});
