import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentUser, AuthContext } from '@c17/auth-context';

import { TasksService, TaskDto } from './tasks.service';
import { PermissionClient } from '../permissions/permission.client';

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assignee_id: z.string().uuid().optional(),
  parent_task_id: z.string().uuid().optional(),
  deadline: z.string().datetime().optional(),
});

const updateStatusSchema = z.object({
  status: z.string().min(1),
  reason: z.string().optional(),
});

const assignSchema = z.object({
  assignee_id: z.string().uuid(),
});

const blockSchema = z.object({
  reason: z.string().min(1),
});

const commentSchema = z.object({
  content: z.string().min(1),
});

const submissionSchema = z.object({
  content: z.string().min(1),
});

const reviewSchema = z.object({
  approved: z.boolean(),
  comment: z.string().optional(),
});

/**
 * Task Management API (V3 §5.3, §5.10).
 * Full task lifecycle with participation, comments, submissions, and activity tracking.
 */
@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly permissionClient: PermissionClient,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tasks with filters' })
  async listTasks(
    @Query('creator_id') creator_id?: string,
    @Query('assignee_id') assignee_id?: string,
    @Query('status') status?: string,
    @Query('parent_task_id') parent_task_id?: string,
  ): Promise<TaskDto[]> {
    return this.tasksService.listTasks({
      creator_id,
      assignee_id,
      status,
      parent_task_id,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task by ID (permission-checked)' })
  async getTask(
    @Param('id') taskId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<TaskDto> {
    if (!user) throw new ForbiddenException('Authentication required');

    // V3 §5.10.1: Check participation via Permission Service
    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      resource_type: 'TASK',
      resource_id: taskId,
      action: 'TASK_PARTICIPATE',
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Cannot access task: ${permCheck.reason_code}`);
    }

    return this.tasksService.getTask(taskId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  async createTask(
    @Body() body: z.infer<typeof createTaskSchema>,
    @CurrentUser() user?: AuthContext,
  ): Promise<TaskDto> {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.tasksService.createTask({
      title: parsed.data.title,
      description: parsed.data.description,
      creator_id: user.userId,
      assignee_id: parsed.data.assignee_id,
      parent_task_id: parsed.data.parent_task_id,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
    });
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update task status' })
  async updateStatus(
    @Param('id') taskId: string,
    @Body() body: z.infer<typeof updateStatusSchema>,
    @CurrentUser() user?: AuthContext,
  ): Promise<TaskDto> {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    // Check permission to modify task
    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      resource_type: 'TASK',
      resource_id: taskId,
      action: 'TASK_MODIFY',
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Cannot modify task: ${permCheck.reason_code}`);
    }

    return this.tasksService.updateTaskStatus(taskId, parsed.data.status, user.userId, parsed.data.reason);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign a task to a user' })
  async assignTask(
    @Param('id') taskId: string,
    @Body() body: z.infer<typeof assignSchema>,
    @CurrentUser() user?: AuthContext,
  ): Promise<TaskDto> {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    // Check permission to modify task
    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      resource_type: 'TASK',
      resource_id: taskId,
      action: 'TASK_MODIFY',
    });

    if (!permCheck.allowed) {
      throw new ForbiddenException(`Cannot modify task: ${permCheck.reason_code}`);
    }

    return this.tasksService.assignTask(taskId, parsed.data.assignee_id, user.userId);
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block a task' })
  async blockTask(
    @Param('id') taskId: string,
    @Body() body: z.infer<typeof blockSchema>,
    @CurrentUser() user?: AuthContext,
  ): Promise<TaskDto> {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = blockSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.tasksService.blockTask(taskId, parsed.data.reason, user.userId);
  }

  @Post(':id/unblock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a task' })
  async unblockTask(
    @Param('id') taskId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<TaskDto> {
    if (!user) throw new ForbiddenException('Authentication required');
    return this.tasksService.unblockTask(taskId, user.userId);
  }

  @Post(':id/participants')
  @ApiOperation({ summary: 'Add a participant to a task' })
  async addParticipant(
    @Param('id') taskId: string,
    @Body() body: { user_id: string; role?: string },
    @CurrentUser() user?: AuthContext,
  ) {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = z
      .object({ user_id: z.string().uuid(), role: z.string().optional() })
      .safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.tasksService.addParticipant(taskId, parsed.data.user_id, parsed.data.role);
  }

  @Get(':id/participants')
  @ApiOperation({ summary: 'Get task participants' })
  async getParticipants(@Param('id') taskId: string) {
    return this.tasksService.getParticipants(taskId);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a comment to a task' })
  async addComment(
    @Param('id') taskId: string,
    @Body() body: z.infer<typeof commentSchema>,
    @CurrentUser() user?: AuthContext,
  ) {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = commentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.tasksService.addComment(taskId, user.userId, parsed.data.content);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit task result for review' })
  async submitResult(
    @Param('id') taskId: string,
    @Body() body: z.infer<typeof submissionSchema>,
    @CurrentUser() user?: AuthContext,
  ) {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = submissionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.tasksService.submitTaskResult(taskId, user.userId, parsed.data.content);
  }

  @Post('submissions/:submission_id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Review a task submission' })
  async reviewSubmission(
    @Param('submission_id') submissionId: string,
    @Body() body: z.infer<typeof reviewSchema>,
    @CurrentUser() user?: AuthContext,
  ) {
    if (!user) throw new ForbiddenException('Authentication required');

    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    return this.tasksService.reviewSubmission(submissionId, user.userId, parsed.data.approved, parsed.data.comment);
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'Get task activity log' })
  async getActivity(@Param('id') taskId: string) {
    return this.tasksService.getTaskActivity(taskId);
  }
}
