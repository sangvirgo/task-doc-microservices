import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsersPanel } from '@/features/admin/users-panel';
import { clearSession, writeSession } from '@/auth/session';

const userId = '11111111-1111-4111-8111-111111111111';
const token = `header.${btoa(JSON.stringify({ role: 'ADMIN', sub: userId }))}.signature`;
vi.mock('@/api/admin', () => ({ adminApi: {
  users: vi.fn().mockResolvedValue([
    { id: '11111111-1111-4111-8111-111111111111', email: 'admin@c17.gov.vn', role: 'ADMIN', locked_at: null, capabilities: ['ARCHIVE_SUBMIT'], created_at: '2026-08-01T00:00:00.000Z' },
    { id: '22222222-2222-4222-8222-222222222222', email: 'staff@c17.gov.vn', role: 'EMPLOYEE', locked_at: null, capabilities: ['ARCHIVE_RECEIVE', 'DISPOSAL_APPROVE'], created_at: '2026-08-02T00:00:00.000Z' },
  ]),
  grantCapability: vi.fn(), revokeCapability: vi.fn(), lock: vi.fn(), unlock: vi.fn(),
} }));

afterEach(() => clearSession());

describe('responsive user capability directory', () => {
  it('renders user cards and colored capability labels without a create-user form', async () => {
    writeSession({ access_token: token, refresh_token: 'refresh', expires_in_seconds: 1800 });
    render(<UsersPanel />);
    expect(await screen.findByText('admin@c17.gov.vn')).toBeVisible();
    expect(screen.getByText('staff@c17.gov.vn')).toBeVisible();
    expect(screen.getAllByText('ARCHIVE_SUBMIT')[0]).toBeVisible();
    expect(screen.getByText('ARCHIVE_RECEIVE')).toBeVisible();
    expect(screen.getByText('DISPOSAL_APPROVE')).toBeVisible();
    expect(screen.queryByText(/create user/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });
});