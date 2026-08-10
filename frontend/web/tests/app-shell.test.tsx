import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/app-shell';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => '/admin/users' }));
vi.mock('@/api/auth', () => ({ authApi: { logout: vi.fn() } }));

afterEach(cleanup);

describe('AppShell role boundary', () => {
  it('does not render content-workflow navigation for an ADMIN session', () => {
    render(<AppShell session={{ access_token: 'access', refresh_token: 'refresh', expires_in_seconds: 1800, expiresAt: 1, role: 'ADMIN', userId: null }}><p>Shell content</p></AppShell>);
    expect(screen.getByText('Administrator')).toBeVisible();
    expect(screen.getByRole('link', { name: /overview/i })).toBeVisible();
    expect(screen.queryByText(/tasks|documents|comments/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Sản phẩm & vận hành')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('keeps the employee workspace focused on active work areas', () => {
    render(<AppShell session={{ access_token: 'access', refresh_token: 'refresh', expires_in_seconds: 1800, expiresAt: 1, role: 'EMPLOYEE', userId: 'employee-id' }}><p>Shell content</p></AppShell>);

    expect(screen.getByRole('link', { name: 'Tổng quan' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Công việc' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Tài liệu' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Quyền tài liệu' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Thông báo' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Hồ sơ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Gói chuyển giao' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lưu giữ & hủy' })).not.toBeInTheDocument();
  });
});
