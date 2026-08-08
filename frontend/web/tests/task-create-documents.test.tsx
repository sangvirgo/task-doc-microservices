import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskList } from '@/features/tasks/task-list';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  directory: vi.fn(),
  upload: vi.fn(),
  attachToTask: vi.fn(),
}));

vi.mock('@/api/tasks', () => ({ tasksApi: { create: mocks.create, list: mocks.list } }));
vi.mock('@/api/admin', () => ({ adminApi: { directory: mocks.directory } }));
vi.mock('@/api/documents', () => ({ documentsApi: { upload: mocks.upload, attachToTask: mocks.attachToTask } }));

const createdTask = {
  id: 'task-created',
  title: 'Rà soát hồ sơ',
  description: null,
  status: 'ASSIGNED' as const,
  creator_id: 'creator-id',
  assignee_id: 'employee-id',
  parent_task_id: null,
  deadline: null,
  blocked: false,
  blocked_reason: null,
  result: null,
  is_overdue: false,
  created_at: '2026-08-07T00:00:00.000Z',
  updated_at: '2026-08-07T00:00:00.000Z',
};

describe('create task with documents', () => {
  beforeEach(() => {
    mocks.list.mockReset().mockResolvedValue([]);
    mocks.directory.mockReset().mockResolvedValue([{ id: 'employee-id', email: 'employee@example.com' }]);
    window.sessionStorage.setItem('c17.web.session.v1', JSON.stringify({ access_token: 'token', refresh_token: 'refresh', expires_in_seconds: 3600, role: 'EMPLOYEE', userId: 'creator-id', expiresAt: Date.now() + 3600000 }));
    mocks.create.mockReset().mockResolvedValue(createdTask);
    mocks.upload.mockReset().mockImplementation(async (_data: FormData, onProgress: (percent: number) => void) => {
      onProgress(100);
      return { document: { id: 'document-id' }, version: { id: 'version-id' } }; 
    });
    mocks.attachToTask.mockReset().mockResolvedValue({ association: { id: 'association-id', task_id: 'task-created', document_id: 'document-id' } });
  });

  it('creates the task first, then uploads every selected file with the required task grant', async () => {
    const { container } = render(<TaskList />);
    const newTaskButtons = await screen.findAllByRole('button', { name: /new task/i });
    fireEvent.click(newTaskButtons[0]);
    expect(screen.queryByRole('combobox', { name: /công việc cha/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tiêu đề công việc'), { target: { value: 'Rà soát hồ sơ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Người được giao' }), { target: { value: 'employee-id' } });
    fireEvent.change(screen.getByLabelText('Hết hạn truy cập'), { target: { value: '2026-08-10T10:30' } });

    const input = container.querySelector<HTMLInputElement>('input[type="file"][multiple]');
    expect(input).not.toBeNull();
    const first = new File(['a'], 'bien-ban.pdf', { type: 'application/pdf' });
    const second = new File(['b'], 'bang-ke.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    fireEvent.change(input!, { target: { files: [first, second] } });

    fireEvent.click(await screen.findByRole('button', { name: /tạo & tải 2 tệp/i }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('parent_task_id');
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.upload.mock.invocationCallOrder[0]);

    for (const [data] of mocks.upload.mock.calls) {
      expect(data.get('task_id')).toBe('task-created');
      expect(JSON.parse(String(data.get('grants')))).toEqual([
        { actor_id: 'creator-id', permissions: ['PREVIEW', 'DOWNLOAD'], expires_at: '2026-08-10T03:30:00.000Z' },
        { actor_id: 'employee-id', permissions: ['PREVIEW', 'DOWNLOAD'], expires_at: '2026-08-10T03:30:00.000Z' },
      ]);
    }
    expect(mocks.attachToTask).toHaveBeenCalledTimes(2);
    expect(mocks.attachToTask).toHaveBeenCalledWith('task-created', 'document-id', expect.arrayContaining([expect.objectContaining({ actor_id: 'creator-id' })]));
  });
  it('creates inline sub-tasks after the parent and supplies parent_task_id automatically', async () => {
    render(<TaskList />);
    fireEvent.click((await screen.findAllByRole('button', { name: /new task/i }))[0]);
    fireEvent.change(screen.getByLabelText('Tiêu đề công việc'), { target: { value: 'Task cha' } });
    fireEvent.click(screen.getByRole('button', { name: /thêm sub-task/i }));
    fireEvent.change(screen.getByLabelText('Tiêu đề sub-task'), { target: { value: 'Task con A' } });
    fireEvent.change(screen.getAllByRole('combobox', { name: 'Người được giao' })[1], { target: { value: 'employee-id' } });
    fireEvent.click(screen.getByRole('button', { name: /tạo công việc/i }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('parent_task_id');
    expect(mocks.create.mock.calls[1][0]).toMatchObject({ title: 'Task con A', parent_task_id: 'task-created' });
  });
});
