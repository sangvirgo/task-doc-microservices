export type CompletionColor = 'GREEN' | 'YELLOW' | 'RED';

export interface TaskProgress {
  completion_percentage: number;
  child_task_count: number;
  approved_child_task_count: number;
  completion_color: CompletionColor;
}

const FAILED_STATUSES = new Set(['REJECTED', 'CANCELLED']);

export function calculateTaskProgress(
  status: string,
  childStatuses: readonly string[],
): TaskProgress {
  const child_task_count = childStatuses.length;
  const approved_child_task_count = childStatuses.filter(
    (childStatus) => childStatus === 'APPROVED',
  ).length;

  if (child_task_count === 0) {
    return {
      completion_percentage: status === 'APPROVED' ? 100 : 0,
      child_task_count,
      approved_child_task_count,
      completion_color: FAILED_STATUSES.has(status)
        ? 'RED'
        : status === 'APPROVED'
          ? 'GREEN'
          : 'YELLOW',
    };
  }

  return {
    completion_percentage: Number(
      ((approved_child_task_count / child_task_count) * 100).toFixed(2),
    ),
    child_task_count,
    approved_child_task_count,
    completion_color:
      FAILED_STATUSES.has(status) ||
      childStatuses.some((childStatus) => FAILED_STATUSES.has(childStatus))
        ? 'RED'
        : approved_child_task_count === child_task_count
          ? 'GREEN'
          : 'YELLOW',
  };
}
