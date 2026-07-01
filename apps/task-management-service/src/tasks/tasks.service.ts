import { Injectable } from '@nestjs/common';

/**
 * Task Management Service (V3 §5.3).
 *
 * Phase 1: skeleton with mock data.
 * Phase 2: implement task lifecycle, hierarchy, and TaskActivity read model.
 */
@Injectable()
export class TasksService {
  /**
   * Get a task by ID.
   * Phase 1: returns mock task.
   * Phase 2: query task_db.
   */
  getTask(taskId: string): {
    id: string;
    title: string;
    description: string;
    status: string;
    creator_id: string;
    assignee_id: string;
    deadline: string;
  } {
    // Phase 1 mock: return static task for testing
    return {
      id: taskId,
      title: `Task ${taskId}`,
      description: 'Phase 1 skeleton task',
      status: 'CREATED',
      creator_id: 'user-1',
      assignee_id: 'user-2',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
}
