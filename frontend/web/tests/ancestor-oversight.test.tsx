import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const taskApiMocks = vi.hoisted(() => ({ get: vi.fn().mockResolvedValue({ title: 'Child task', status: 'IN_PROGRESS', assignee: 'employee', deadline: null, is_overdue: false, completion_result: null }), participants: vi.fn(), activity: vi.fn(), comments: vi.fn() }));
vi.mock('@/api/tasks', () => ({ tasksApi: taskApiMocks }));
import { TaskDetail } from '@/features/tasks/task-detail';

it('Ancestor Oversight sends no participant, activity, or Comment request and renders summary only', async () => {
  render(<TaskDetail id="child-task" />);
  await waitFor(() => expect(screen.getByText(/Ancestor oversight: summary only/i)).toBeVisible());
  expect(taskApiMocks.participants).not.toHaveBeenCalled();
  expect(taskApiMocks.activity).not.toHaveBeenCalled();
  expect(taskApiMocks.comments).not.toHaveBeenCalled();
  expect(screen.queryByText('Comments')).not.toBeInTheDocument();
  expect(screen.queryByText('Documents')).not.toBeInTheDocument();
});
