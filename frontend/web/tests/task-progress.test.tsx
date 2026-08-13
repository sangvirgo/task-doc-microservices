import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { TaskProgress } from '@/features/tasks/task-progress';

afterEach(() => {
  cleanup();
});

describe('TaskProgress', () => {
  it('renders the approved child-task ratio for a parent task', () => {
    render(
      <TaskProgress
        status="IN_PROGRESS"
        completion_percentage={66.67}
        child_task_count={3}
        approved_child_task_count={2}
        completion_color="YELLOW"
      />,
    );

    expect(screen.getByText('Tiến độ sub-task')).toBeInTheDocument();
    expect(screen.getByText('66.67%')).toBeInTheDocument();
    expect(screen.getByText('2/3 sub-task đã phê duyệt')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '66.67',
    );
  });

  it('renders the workflow stepper for a leaf task without a misleading percentage', () => {
    render(<TaskProgress status="IN_PROGRESS" />);

    expect(screen.getByText('Tiến độ công việc')).toBeInTheDocument();
    expect(screen.queryByText('Vòng đời công việc')).not.toBeInTheDocument();
    expect(screen.getByText('Đang làm')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('explains that a task needing revision continues from in progress', () => {
    render(<TaskProgress status="NEED_REVISION" />);

    expect(screen.getByText('Cần chỉnh sửa')).toBeInTheDocument();
    expect(screen.getByText('Tiếp tục từ bước Đang làm')).toBeInTheDocument();
  });

  it.each([
    ['REJECTED', 'Từ chối'],
    ['CANCELLED', 'Đã hủy'],
  ] as const)('renders the terminal state for %s', (status, label) => {
    render(<TaskProgress status={status} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders a compact parent indicator and hides compact leaf progress', () => {
    const { rerender } = render(
      <TaskProgress
        compact
        status="IN_PROGRESS"
        completion_percentage={50}
        child_task_count={2}
        approved_child_task_count={1}
        completion_color="YELLOW"
      />,
    );

    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

    rerender(<TaskProgress compact status="IN_PROGRESS" />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('1/2')).not.toBeInTheDocument();
  });
});
