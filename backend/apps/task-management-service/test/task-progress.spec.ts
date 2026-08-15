import { calculateTaskProgress } from '../src/tasks/task-progress';

describe('calculateTaskProgress', () => {
  it('returns 100 percent and green for an approved task without children', () => {
    expect(calculateTaskProgress('APPROVED', [])).toEqual({
      completion_percentage: 100,
      child_task_count: 0,
      approved_child_task_count: 0,
      completion_color: 'GREEN',
    });
  });

  it('returns zero percent and red for a rejected or cancelled task without children', () => {
    expect(calculateTaskProgress('REJECTED', [])).toEqual({
      completion_percentage: 0,
      child_task_count: 0,
      approved_child_task_count: 0,
      completion_color: 'RED',
    });
    expect(calculateTaskProgress('CANCELLED', [])).toEqual({
      completion_percentage: 0,
      child_task_count: 0,
      approved_child_task_count: 0,
      completion_color: 'RED',
    });
  });

  it('calculates progress from approved children and marks failed children red', () => {
    expect(calculateTaskProgress('IN_PROGRESS', ['APPROVED', 'APPROVED', 'REJECTED'])).toEqual({
      completion_percentage: 66.67,
      child_task_count: 3,
      approved_child_task_count: 2,
      completion_color: 'RED',
    });
  });

  it('returns green when all children are approved even if the parent is awaiting review', () => {
    expect(calculateTaskProgress('WAITING_REVIEW', ['APPROVED', 'APPROVED'])).toEqual({
      completion_percentage: 100,
      child_task_count: 2,
      approved_child_task_count: 2,
      completion_color: 'GREEN',
    });
  });
});
