import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { randomUUID } from 'crypto';

import { CurrentUser, AuthContext } from '@c17/auth-context';
import { buildEventEnvelope, PermissionAction, ResourceType } from '@c17/contracts';
import { EVENT_PUBLISHER, type EventPublisher } from '@c17/messaging';
import { getCorrelationId } from '@c17/observability';

import { TasksService, TaskCommentDto, TaskDto } from './tasks.service';
import { PermissionClient } from '../permissions/permission.client';
import { AuditClient } from '../audit/audit.client';
import { UserRoleClient } from '../users/user-role.client';

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
    private readonly auditClient: AuditClient,
    private readonly userRoleClient: UserRoleClient,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: EventPublisher,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tasks with filters' })
  async listTasks(
    @Query('creator_id') creator_id?: string,
    @Query('assignee_id') assignee_id?: string,
    @Query('status') status?: string,
    @Query('parent_task_id') parent_task_id?: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<TaskDto[]> {
    if (!user) throw new ForbiddenException('Authentication required');

    await this.assertPermission(user, PermissionAction.TASK_VIEW, randomUUID());

    return this.tasksService.listTasks(user.userId, {
      creator_id,
      assignee_id,
      status,
      parent_task_id,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task by ID (permission-checked)' })
  async getTask(@Param('id') taskId: string, @CurrentUser() user?: AuthContext): Promise<TaskDto> {
    if (!user) throw new ForbiddenException('Authentication required');
    await this.assertPermission(user, PermissionAction.TASK_VIEW, taskId);
    return this.tasksService.getTask(taskId, user.userId);
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
    await this.assertPermission(
      user,
      PermissionAction.TASK_CREATE,
      parsed.data.parent_task_id ?? randomUUID(),
    );
    if (parsed.data.assignee_id) {
      await this.userRoleClient.assertEmployee(parsed.data.assignee_id);
    }

    return this.tasksService
      .createTask({
        title: parsed.data.title,
        description: parsed.data.description,
        creator_id: user.userId,
        assignee_id: parsed.data.assignee_id,
        parent_task_id: parsed.data.parent_task_id,
        deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
      })
      .then(async (task) => {
        await this.auditClient.record({
          event_type: 'TASK_CREATED',
          actor_id: user.userId,
          resource_type: 'TASK',
          resource_id: task.id,
          payload: { title: task.title, assignee_id: task.assignee_id },
        });
        void this.eventPublisher.publish(
          buildEventEnvelope({
            event_id: randomUUID(),
            event_type: 'task.created',
            occurred_at: new Date().toISOString(),
            producer: 'task-management-service',
            correlation_id: getCorrelationId() ?? randomUUID(),
            actor_id: user.userId,
            resource_type: 'TASK',
            resource_id: task.id,
            payload: { title: task.title, assignee_id: task.assignee_id },
          }),
        );
        return task;
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
    await this.assertPermission(user, PermissionAction.TASK_MODIFY, taskId);

    return this.tasksService.updateTaskStatus(
      taskId,
      parsed.data.status,
      user.userId,
      parsed.data.reason,
    );
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
    await this.assertPermission(user, PermissionAction.TASK_ASSIGN, taskId);
    await this.userRoleClient.assertEmployee(parsed.data.assignee_id);

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
    await this.assertPermission(user, PermissionAction.TASK_MODIFY, taskId);
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
    await this.assertPermission(user, PermissionAction.TASK_MODIFY, taskId);
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
    await this.assertPermission(user, PermissionAction.TASK_ASSIGN, taskId);
    await this.userRoleClient.assertEmployee(parsed.data.user_id);
    return this.tasksService.addParticipant(
      taskId,
      parsed.data.user_id,
      user.userId,
      parsed.data.role,
    );
  }

  @Get(':id/participants')
  @ApiOperation({ summary: 'Get task participants' })
  async getParticipants(@Param('id') taskId: string, @CurrentUser() user?: AuthContext) {
    if (!user) throw new ForbiddenException('Authentication required');
    await this.assertPermission(user, PermissionAction.TASK_VIEW, taskId);
    return this.tasksService.getParticipants(taskId, user.userId);
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'List task comments' })
  async getComments(
    @Param('id') taskId: string,
    @CurrentUser() user?: AuthContext,
  ): Promise<TaskCommentDto[]> {
    if (!user) throw new ForbiddenException('Authentication required');
    await this.assertPermission(user, PermissionAction.TASK_COMMENT, taskId, {
      deniedEventType: 'TASK_COMMENT_ACCESS_DENIED',
    });
    try {
      return await this.tasksService.getComments(taskId, user.userId);
    } catch (error) {
      await this.auditDirectCommentDenial(taskId, user.userId, error);
      throw error;
    }
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
    await this.assertPermission(user, PermissionAction.TASK_COMMENT, taskId, {
      deniedEventType: 'TASK_COMMENT_ACCESS_DENIED',
    });
    try {
      return await this.tasksService.addComment(taskId, user.userId, parsed.data.content);
    } catch (error) {
      await this.auditDirectCommentDenial(taskId, user.userId, error);
      throw error;
    }
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
    await this.assertPermission(user, PermissionAction.TASK_SUBMIT, taskId);
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
    await this.assertPermission(user, PermissionAction.TASK_REVIEW, submissionId);
    return this.tasksService.reviewSubmission(
      submissionId,
      user.userId,
      parsed.data.approved,
      parsed.data.comment,
    );
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'Get task activity log' })
  async getActivity(@Param('id') taskId: string, @CurrentUser() user?: AuthContext) {
    if (!user) throw new ForbiddenException('Authentication required');
    await this.assertPermission(user, PermissionAction.TASK_VIEW, taskId);
    return this.tasksService.getTaskActivity(taskId, user.userId);
  }

  private async assertPermission(
    user: AuthContext,
    action: PermissionAction,
    resourceId: string,
    options?: { deniedEventType?: string },
  ): Promise<void> {
    const permCheck = await this.permissionClient.check({
      actor_id: user.userId,
      actor_role: user.role,
      resource_type: ResourceType.TASK,
      resource_id: resourceId,
      action,
      task_id: resourceId,
      correlation_id: getCorrelationId() ?? randomUUID(),
    });

    if (!permCheck.allowed) {
      if (options?.deniedEventType) {
        await this.auditClient.record({
          event_type: options.deniedEventType,
          actor_id: user.userId,
          resource_type: ResourceType.TASK,
          resource_id: resourceId,
          payload: { action, reason_code: permCheck.reason_code },
        });
      }
      throw new ForbiddenException(`Task access denied: ${permCheck.reason_code}`);
    }
  }

  private async auditDirectCommentDenial(
    taskId: string,
    actorId: string,
    error: unknown,
  ): Promise<void> {
    if (!(error instanceof ForbiddenException)) {
      return;
    }

    await this.auditClient.record({
      event_type: 'TASK_COMMENT_ACCESS_DENIED',
      actor_id: actorId,
      resource_type: ResourceType.TASK,
      resource_id: taskId,
      payload: {
        action: PermissionAction.TASK_COMMENT,
        reason_code: 'NOT_A_PARTICIPANT',
      },
    });
  }
}
