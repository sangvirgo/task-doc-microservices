export const TASK_STATUSES = ['CREATED','ASSIGNED','IN_PROGRESS','WAITING_REVIEW','APPROVED','NEED_REVISION','REJECTED','CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export interface Task { id: string; title: string; description: string | null; status: TaskStatus; creator_id: string; assignee_id: string | null; reviewer_id?: string | null; parent_task_id: string | null; deadline: string | null; blocked: boolean; blocked_reason: string | null; result: string | null; is_overdue: boolean; created_at: string; updated_at: string; }
export interface AncestorTaskSummary { title: string; status: TaskStatus; assignee: string | null; deadline: string | null; is_overdue: boolean; completion_result: string | null; }
export interface Participant { id: string; task_id: string; user_id: string; role: string; added_at: string; }
export interface Activity { id: string; activity_type: string; actor_id: string; summary: string; created_at: string; }
export interface TaskComment { id: string; task_id: string; author_id: string; content: string; created_at: string; }
export interface TaskCommentResult { id: string; created_at: string; }
export interface TaskSubmissionResult { id: string; status: string; created_at: string; }
export interface TaskReviewResult { id: string; status: string; }
export interface TaskSubmission { id: string; task_id: string; author_id: string; content: string; status: string; reviewer_id: string | null; review_comment: string | null; reviewed_at: string | null; created_at: string; }
export interface CreateTaskInput { title: string; description?: string; assignee_id?: string; reviewer_id?: string | null; parent_task_id?: string; deadline?: string; }
