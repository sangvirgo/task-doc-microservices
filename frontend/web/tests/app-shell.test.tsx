import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/app-shell';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => '/admin/users' }));
vi.mock('@/api/auth', () => ({ authApi: { logout: vi.fn() } }));

describe('AppShell role boundary', () => {
  it('does not render content-workflow navigation for an ADMIN session', () => {
    render(<AppShell session={{ access_token: 'access', refresh_token: 'refresh', expires_in_seconds: 1800, expiresAt: 1, role: 'ADMIN', userId: null }}><p>Shell content</p></AppShell>);
    expect(screen.getByText('Administrator')).toBeVisible();
    expect(screen.getByRole('link', { name: /overview/i })).toBeVisible();
    expect(screen.queryByText(/tasks|documents|comments/i)).not.toBeInTheDocument();
  });
});
