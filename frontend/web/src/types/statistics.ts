import type { TaskStatus } from './task';

export type StatisticsScope = 'ME' | 'ORGANIZATION';

export interface StatisticsOverview {
  scope: StatisticsScope;
  range: { from: string; to: string };
  summary: {
    total_tasks: number;
    in_progress_tasks: number;
    approved_tasks: number;
    overdue_tasks: number;
    visible_documents: number;
    task_documents: number;
    security_alerts: number;
  };
  task_status: Record<TaskStatus, number>;
  task_trend: Array<{ date: string; created: number; completed: number }>;
  recent_activity: Array<{ id: string; type: string; message: string; created_at: string }>;
  users?: { total: number; active_employees: number; locked_users: number };
  organization_tasks?: { total: number; approved: number; overdue: number };
  security?: { open_alerts: number; audit_chain: 'VALID' | 'INVALID' };
  retention?: { eligible_documents: number };
  growth_trend?: Array<{ date: string; users: number; tasks: number }>;
}
