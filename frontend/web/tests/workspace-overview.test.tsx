import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceOverview } from '@/features/workspace/workspace-overview';

const mocks = vi.hoisted(() => ({ overview: vi.fn() }));

vi.mock('@/api/statistics', () => ({ statisticsApi: { overview: mocks.overview } }));

beforeEach(() => {
  mocks.overview.mockReset().mockResolvedValue({
    scope: 'ME',
    range: { from: '2026-07-12', to: '2026-08-10' },
    summary: {
      total_tasks: 24,
      in_progress_tasks: 8,
      approved_tasks: 13,
      overdue_tasks: 3,
      visible_documents: 18,
      task_documents: 11,
      security_alerts: 2,
    },
    task_status: {
      CREATED: 2,
      ASSIGNED: 4,
      IN_PROGRESS: 8,
      WAITING_REVIEW: 0,
      APPROVED: 13,
      NEED_REVISION: 1,
      REJECTED: 1,
      CANCELLED: 0,
    },
    task_trend: [{ date: '2026-08-10', created: 4, completed: 2 }],
    recent_activity: [{ id: 'activity-1', type: 'TASK_ASSIGNED', message: 'Task được giao cho bạn', created_at: '2026-08-10T10:00:00Z' }],
  });
  window.sessionStorage.setItem('c17.web.session.v1', JSON.stringify({ access_token: 'token', refresh_token: 'refresh', expires_in_seconds: 3600, role: 'EMPLOYEE', userId: 'employee-id', expiresAt: Date.now() + 3600000 }));
});

it('renders permission-scoped work, document and activity overview', async () => {
  render(<WorkspaceOverview />);

  expect(await screen.findByRole('heading', { name: 'Tổng quan' })).toBeInTheDocument();
  expect(screen.getByText('24')).toBeVisible();
  expect(screen.getAllByText('18').length).toBeGreaterThan(0);
  expect(screen.getByText('Task được giao cho bạn')).toBeVisible();
  expect(mocks.overview).toHaveBeenCalledWith('ME', expect.any(String), expect.any(String));
});

it('shows organization cards for an admin without adding another API flow', async () => {
  window.sessionStorage.setItem('c17.web.session.v1', JSON.stringify({ access_token: 'token', refresh_token: 'refresh', expires_in_seconds: 3600, role: 'ADMIN', userId: 'admin-id', expiresAt: Date.now() + 3600000 }));
  mocks.overview.mockResolvedValueOnce({
    scope: 'ORGANIZATION',
    range: { from: '2026-07-12', to: '2026-08-10' },
    summary: { total_tasks: 482, in_progress_tasks: 42, approved_tasks: 301, overdue_tasks: 27, visible_documents: 100, task_documents: 90, security_alerts: 7 },
    task_status: { CREATED: 0, ASSIGNED: 0, IN_PROGRESS: 42, WAITING_REVIEW: 0, APPROVED: 301, NEED_REVISION: 0, REJECTED: 0, CANCELLED: 0 },
    task_trend: [],
    recent_activity: [],
    users: { total: 128, active_employees: 116, locked_users: 4 },
    organization_tasks: { total: 482, approved: 301, overdue: 27 },
    security: { open_alerts: 7, audit_chain: 'VALID' },
    retention: { eligible_documents: 4 },
    growth_trend: [],
  });

  render(<WorkspaceOverview />);

  await waitFor(() => expect(screen.getByText('Toàn hệ thống')).toBeVisible());
  expect(screen.getByText('128')).toBeVisible();
  expect(screen.getByText('Chuỗi audit hợp lệ')).toBeVisible();
  expect(mocks.overview).toHaveBeenCalledWith('ORGANIZATION', expect.any(String), expect.any(String));
});
