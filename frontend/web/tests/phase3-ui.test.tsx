import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GrantList } from '@/features/grants/grant-list';
import { NotificationList } from '@/features/notifications/notification-list';
import { clearSession, writeSession } from '@/auth/session';

const userId = '11111111-1111-4111-8111-111111111111';
const token = (role: string) => `header.${btoa(JSON.stringify({ role, sub: userId }))}.signature`;
vi.mock('@/api/grants', () => ({ grantsApi: { list: vi.fn().mockResolvedValue([{ id: 'grant-id', resource_type: 'DOCUMENT', status: 'REVOKED', effective_expires_at: '2026-08-04T12:00:00.000Z', revoked_at: '2026-08-03T12:00:00.000Z' }]) } }));
vi.mock('@/api/notifications', () => ({ notificationsApi: { list: vi.fn().mockResolvedValue([]), preferences: vi.fn().mockResolvedValue({ id: 'pref', user_id: '11111111-1111-4111-8111-111111111111', email_enabled: true, in_app_enabled: true }) } }));
afterEach(() => { clearSession(); });

describe('Phase 3 server-result presentation', () => {
  it('renders returned grant revocation and effective expiry rather than calculating them', async () => { writeSession({ access_token: token('EMPLOYEE'), refresh_token: 'r', expires_in_seconds: 1800 }); render(<GrantList />); expect(await screen.findByText('REVOKED')).toBeVisible(); expect(screen.getAllByText(/2026/)).toHaveLength(2); });
  it('does not render grant workflow content for ADMIN', () => { writeSession({ access_token: token('ADMIN'), refresh_token: 'r', expires_in_seconds: 1800 }); render(<GrantList />); expect(screen.getByText('Access denied')).toBeVisible(); });
  it('renders the empty notification state from a Gateway response', async () => { writeSession({ access_token: token('EMPLOYEE'), refresh_token: 'r', expires_in_seconds: 1800 }); render(<NotificationList />); expect(await screen.findByText('No notifications')).toBeVisible(); });
});
