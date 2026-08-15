import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskAssignmentDrawer } from '@/features/tasks/task-assignment-drawer';
import type { MemberOption } from '@/types/admin';

const members: MemberOption[] = [
  { id: 'creator-id', email: 'creator@example.com' },
  { id: 'employee-id', email: 'employee@example.com' },
  { id: 'reviewer-id', email: 'reviewer@example.com' },
];

describe('TaskAssignmentDrawer', () => {
  afterEach(cleanup);

  it('defaults review to the creator and switches between create and assign copy', async () => {
    const onSubmit = vi.fn();
    render(<TaskAssignmentDrawer currentUserId="creator-id" members={members} onSubmit={onSubmit} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo task' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tiêu đề task'), { target: { value: 'Rà soát hồ sơ' } });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Rà soát hồ sơ',
      reviewer_id: 'creator-id',
    }), expect.any(HTMLFormElement)));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('assignee_id');

    fireEvent.change(screen.getByRole('combobox', { name: 'Người được giao' }), { target: { value: 'employee-id' } });
    expect(screen.getByRole('button', { name: 'Giao task' })).toBeInTheDocument();
  });

  it('blocks assigning the reviewer to the same person and keeps the form actionable after correction', () => {
    const onSubmit = vi.fn();
    render(<TaskAssignmentDrawer currentUserId="creator-id" members={members} onSubmit={onSubmit} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Tiêu đề task'), { target: { value: 'Rà soát hồ sơ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Người được giao' }), { target: { value: 'reviewer-id' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Người review' }), { target: { value: 'reviewer-id' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Người được giao và người review phải là hai người khác nhau.');
    expect(screen.getByRole('button', { name: 'Giao task' })).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox', { name: 'Người review' }), { target: { value: 'creator-id' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Giao task' })).toBeEnabled();
  });
});
