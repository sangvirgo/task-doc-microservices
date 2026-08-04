import { gatewayClient } from './client';
import type { Activity, AncestorTaskSummary, CreateTaskInput, Participant, Task, TaskComment, TaskStatus, TaskSubmission } from '@/types/task';
export const tasksApi = {
  list: (filters: Record<string, string> = {}) => gatewayClient.get<Task[]>(`/tasks${Object.keys(filters).length ? `?${new URLSearchParams(filters)}` : ''}`),
  get: (id: string) => gatewayClient.get<Task | AncestorTaskSummary>(`/tasks/${encodeURIComponent(id)}`),
  create: (input: CreateTaskInput) => gatewayClient.post<Task>('/tasks', input),
  assign: (id: string, assignee_id: string) => gatewayClient.post<Task>(`/tasks/${encodeURIComponent(id)}/assign`, { assignee_id }),
  addParticipant: (id: string, user_id: string, role?: string) => gatewayClient.post<Participant>(`/tasks/${encodeURIComponent(id)}/participants`, { user_id, ...(role ? { role } : {}) }),
  participants: (id: string) => gatewayClient.get<Participant[]>(`/tasks/${encodeURIComponent(id)}/participants`),
  activity: (id: string) => gatewayClient.get<Activity[]>(`/tasks/${encodeURIComponent(id)}/activity`),
  comments: (id: string) => gatewayClient.get<TaskComment[]>(`/tasks/${encodeURIComponent(id)}/comments`),
  comment: (id: string, content: string) => gatewayClient.post(`/tasks/${encodeURIComponent(id)}/comments`, { content }),
  status: (id: string, status: Exclude<TaskStatus, 'BLOCKED'>, reason?: string) => gatewayClient.post<Task>(`/tasks/${encodeURIComponent(id)}/status`, { status, reason }),
  block: (id: string, reason: string) => gatewayClient.post<Task>(`/tasks/${encodeURIComponent(id)}/block`, { reason }),
  unblock: (id: string) => gatewayClient.post<Task>(`/tasks/${encodeURIComponent(id)}/unblock`),
  submit: (id: string, content: string) => gatewayClient.post<TaskSubmission>(`/tasks/${encodeURIComponent(id)}/submit`, { content }),
  review: (submissionId: string, decision: 'APPROVED'|'NEED_REVISION'|'REJECTED', comment?: string) => gatewayClient.post<Task>(`/tasks/submissions/${encodeURIComponent(submissionId)}/review`, { decision, ...(comment ? { comment } : {}) }),
};
