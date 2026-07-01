import { Controller, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '@c17/auth-context';

import { TasksService } from './tasks.service';
import { PermissionClient } from '../permissions/permission.client';

/**
 * Task Management API (V3 §5.3, §5.10).
 *
 * Phase 1: skeleton endpoints with permission checks.
 * Phase 2: implement full task lifecycle, hierarchy, comments, and TaskActivity.
 */
@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly permissionClient: PermissionClient,
  ) {}

  /**
   * Get a task by ID with permission check.
   * Caller must be a participant (creator, assignee, or explicitly assigned).
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a task by ID' })
  async getTask(
    @Param('id') taskId: string,
    @CurrentUser() user?: { userId: string; role: string },
  ) {
    // Phase 1: mock user if not provided
    const userId = user?.userId || 'user-1';

    // V3 §5.10.1: Check participation via Permission Service
    const permCheck = await this.permissionClient.check({
      actor_id: userId,
      resource_type: 'TASK',
      resource_id: taskId,
      action: 'TASK_PARTICIPATE',
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Cannot access task: ${permCheck.reason_code}`);
    }

    return this.tasksService.getTask(taskId);
  }

  /**
   * Create a task (Phase 2).
   */
  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  createTask(@CurrentUser() user?: { userId: string; role: string }) {
    const userId = user?.userId || 'user-1';

    // Phase 1: stub
    return {
      id: 'task-' + Date.now(),
      title: 'New task',
      creator_id: userId,
      status: 'CREATED',
    };
  }
}
