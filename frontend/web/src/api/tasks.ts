import { gatewayClient } from './client';
import type { Activity, AncestorTaskSummary, CreateTaskInput, Participant, Task, TaskComment, TaskCommentResult, TaskReviewResult, TaskStatus, TaskSubmission, TaskSubmissionResult } from '@/types/task';
import type { PaginatedResponse } from '@/types/pagination';

const pageQuery = (page: number, pageSize: number) => `page=${page}&page_size=${pageSize}`;
const query = (filters: Record<string, string>) => {
  const value = new URLSearchParams(filters).toString();
  return value ? `?${value}` : '';
};

export const tasksApi = {
  list: (filters: Record<string, string> = {}) => gatewayClient.getList<Task>(`/tasks${query(filters)}`),
  listPage: (filters: Record<string, string> = {}) => gatewayClient.getPage<Task>(`/tasks${query(filters)}`),
  children: (parentTaskId: string) => gatewayClient.getList<Task>(`/tasks?parent_task_id=${encodeURIComponent(parentTaskId)}`),
  childrenPage: (parentTaskId: string, page = 1, pageSize = 20) => gatewayClient.getPage<Task>(`/tasks?parent_task_id=${encodeURIComponent(parentTaskId)}&${pageQuery(page, pageSize)}`),
  get: (id: string) => gatewayClient.get<Task | AncestorTaskSummary>(`/tasks/${encodeURIComponent(id)}`),
  create: (input: CreateTaskInput) => gatewayClient.post<Task>('/tasks', input),
  update: (id: string, input: Partial<Pick<CreateTaskInput, 'title' | 'description' | 'deadline'>>) => gatewayClient.patch<Task>(`/tasks/${encodeURIComponent(id)}`, input),
  assign: (id: string, assignee_id: string) => gatewayClient.post<Task>(`/tasks/${encodeURIComponent(id)}/assign`, { assignee_id }),
  reviewer: (id: string, reviewer_id: string) => gatewayClient.put<Task>(`/tasks/${encodeURIComponent(id)}/reviewer`, { reviewer_id }),
  addParticipant: (id: string, user_id: string, role?: string) => gatewayClient.post<Participant>(`/tasks/${encodeURIComponent(id)}/participants`, { user_id, ...(role ? { role } : {}) }),
  participants: (id: string) => gatewayClient.getList<Participant>(`/tasks/${encodeURIComponent(id)}/participants`),
  activity: (id: string) => gatewayClient.getList<Activity>(`/tasks/${encodeURIComponent(id)}/activity`),
  activityPage: (id: string, page = 1, pageSize = 20): Promise<PaginatedResponse<Activity>> => gatewayClient.getPage<Activity>(`/tasks/${encodeURIComponent(id)}/activity?${pageQuery(page, pageSize)}`),
  comments: (id: string) => gatewayClient.getList<TaskComment>(`/tasks/${encodeURIComponent(id)}/comments`),
  commentsPage: (id: string, page = 1, pageSize = 20): Promise<PaginatedResponse<TaskComment>> => gatewayClient.getPage<TaskComment>(`/tasks/${encodeURIComponent(id)}/comments?${pageQuery(page, pageSize)}`),
  comment: (id: string, content: string) => gatewayClient.post<TaskCommentResult>(`/tasks/${encodeURIComponent(id)}/comments`, { content }),
  status: (id: string, status: Exclude<TaskStatus, 'BLOCKED'>, reason?: string) => gatewayClient.post<Task>(`/tasks/${encodeURIComponent(id)}/status`, { status, reason }),
  block: (id: string, reason: string) => gatewayClient.post<Task>(`/tasks/${encodeURIComponent(id)}/block`, { reason }),
  unblock: (id: string) => gatewayClient.post<Task>(`/tasks/${encodeURIComponent(id)}/unblock`),
  submit: (id: string, content: string) => gatewayClient.post<TaskSubmissionResult>(`/tasks/${encodeURIComponent(id)}/submit`, { content }),
  submissions: (id: string) => gatewayClient.getList<TaskSubmission>(`/tasks/${encodeURIComponent(id)}/submissions`),
  submission: (id: string, submissionId: string) => gatewayClient.get<TaskSubmission>(`/tasks/${encodeURIComponent(id)}/submissions/${encodeURIComponent(submissionId)}`),
  review: (idOrSubmissionId: string, submissionIdOrDecision: string, decision?: 'APPROVED'|'NEED_REVISION'|'REJECTED', comment?: string) => {
    if (!decision) return gatewayClient.post<TaskReviewResult>('/tasks/submissions/' + encodeURIComponent(idOrSubmissionId) + '/review', { decision: submissionIdOrDecision });
    return gatewayClient.post<TaskReviewResult>('/tasks/' + encodeURIComponent(idOrSubmissionId) + '/submissions/' + encodeURIComponent(submissionIdOrDecision) + '/review', { decision, ...(comment ? { comment } : {}) });
  },
};
