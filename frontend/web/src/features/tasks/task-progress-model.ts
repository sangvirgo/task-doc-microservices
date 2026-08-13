import type { CompletionColor, TaskStatus } from '@/types/task';

export interface TaskProgressInput {
  status: TaskStatus;
  completion_percentage?: number;
  child_task_count?: number;
  approved_child_task_count?: number;
  completion_color?: CompletionColor;
}

export const workflowSteps = [
  { status: 'CREATED', label: 'Mới tạo' },
  { status: 'ASSIGNED', label: 'Đã giao' },
  { status: 'IN_PROGRESS', label: 'Đang làm' },
  { status: 'WAITING_REVIEW', label: 'Chờ phê duyệt' },
  { status: 'APPROVED', label: 'Đã phê duyệt' },
] as const;

export function clampPercentage(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Number(value)));
}

export function clampCount(value: number | undefined, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maximum, Math.max(0, Math.floor(Number(value))));
}

export function workflowStepIndex(status: TaskStatus): number {
  if (status === 'NEED_REVISION') return 2;
  const index = workflowSteps.findIndex(step => step.status === status);
  return index >= 0 ? index : 0;
}

export function buildTaskProgressModel(input: TaskProgressInput) {
  const childCount = clampCount(input.child_task_count);
  const approvedCount = clampCount(input.approved_child_task_count, childCount);

  return {
    hasChildren: childCount > 0,
    childCount,
    approvedCount,
    percentage: clampPercentage(input.completion_percentage),
    color: input.completion_color ?? 'YELLOW' as CompletionColor,
    stepIndex: workflowStepIndex(input.status),
    failed: input.status === 'REJECTED' || input.status === 'CANCELLED',
  };
}
