import { afterEach, describe, expect, it } from 'vitest';
import { clearSession, readSession, writeSession } from '@/auth/session';

const adminToken = `header.${btoa(JSON.stringify({ role: 'ADMIN' }))}.signature`;
describe('browser session', () => {
  afterEach(clearSession);
  it('stores one namespaced sessionStorage record and derives a UX role', () => {
    writeSession({ access_token: adminToken, refresh_token: 'refresh', expires_in_seconds: 1800 });
    expect(readSession()).toMatchObject({ role: 'ADMIN', refresh_token: 'refresh' });
    expect(Object.keys(sessionStorage)).toEqual(['c17.web.session.v1']);
  });
  it('clears the complete record', () => { writeSession({ access_token: adminToken, refresh_token: 'refresh', expires_in_seconds: 1800 }); clearSession(); expect(readSession()).toBeNull(); });
});
