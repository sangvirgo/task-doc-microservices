import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/app-shell';

const mocks = vi.hoisted(() => ({
  directory: vi.fn(),
  notifications: vi.fn(),
  tasks: vi.fn(),
  documents: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => '/workspace' }));
vi.mock('@/api/auth', () => ({ authApi: { logout: vi.fn() } }));
vi.mock('@/api/admin', () => ({ adminApi: { directory: mocks.directory } }));
vi.mock('@/api/notifications', () => ({ notificationsApi: { list: mocks.notifications } }));
vi.mock('@/api/tasks', () => ({ tasksApi: { list: mocks.tasks } }));
vi.mock('@/api/documents', () => ({ documentsApi: { list: mocks.documents } }));

const session = { access_token: 'access', refresh_token: 'refresh', expires_in_seconds: 1800, expiresAt: 1, role: 'EMPLOYEE' as const, userId: 'employee-id' };

describe('workspace global search', () => {
  beforeEach(() => {
    mocks.directory.mockResolvedValue([{ id: 'employee-id', email: 'employee@example.com' }]);
    mocks.notifications.mockResolvedValue([]);
    mocks.tasks.mockResolvedValue([{ id: 'task-1', title: 'DDD rollout', description: 'Searchable task', status: 'ASSIGNED' }]);
    mocks.documents.mockResolvedValue([]);
  });

  afterEach(cleanup);

  it('shows matching tasks from the global search input', async () => {
    render(<AppShell session={session}><p>Shell content</p></AppShell>);

    fireEvent.change(screen.getByPlaceholderText('Tìm nhanh'), { target: { value: 'ddd' } });

    expect(await screen.findByRole('link', { name: /DDD rollout/i })).toHaveAttribute('href', '/tasks/task-1');
  });
});
