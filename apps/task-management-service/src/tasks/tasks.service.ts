import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { TaskPrismaService } from '../prisma/task-prisma.service';

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  status: string;
  creator_id: string;
  assignee_id: string | null;
  parent_task_id: string | null;
  deadline: string | null;
  blocked: boolean;
  blocked_reason: string | null;
  result: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskParticipantDto {
  id: string;
  task_id: string;
  user_id: string;
  role: string;
  added_at: string;
}

export interface TaskCommentDto {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

const VALID_STATUSES = ['CREATED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED', 'BLOCKED'];

@Injectable()
export class TasksService {
  constructor(private readonly prisma: TaskPrismaService) {}

  async createTask(data: {
    title: string;
    description?: string;
    creator_id: string;
    assignee_id?: string;
    parent_task_id?: string;
    deadline?: Date;
  }): Promise<TaskDto> {
    if (data.parent_task_id) {
      const parent = await this.requireTask(data.parent_task_id);
      if (parent.assignee_id !== data.creator_id) {
        throw new ForbiddenException('Only the current parent assignee may create a child task');
      }
    }

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          title: data.title,
          description: data.description || null,
          creator_id: data.creator_id,
          assignee_id: data.assignee_id || null,
          parent_task_id: data.parent_task_id || null,
          deadline: data.deadline || null,
          status: 'CREATED',
        },
      });

      await tx.taskParticipant.create({
        data: {
          task_id: created.id,
          user_id: data.creator_id,
          role: 'CREATOR',
        },
      });

      if (data.assignee_id && data.assignee_id !== data.creator_id) {
        await tx.taskParticipant.upsert({
          where: { task_id_user_id: { task_id: created.id, user_id: data.assignee_id } },
          update: { role: 'ASSIGNEE' },
          create: {
            task_id: created.id,
            user_id: data.assignee_id,
            role: 'ASSIGNEE',
          },
        });
      }

      return created;
    });

    return this.toDto(task);
  }

  async getTask(id: string, actor_id: string): Promise<TaskDto> {
    await this.assertDirectParticipant(id, actor_id);
    const task = await this.requireTask(id);
    return this.toDto(task);
  }

  async listTasks(
    actor_id: string,
    filters?: {
      creator_id?: string;
      assignee_id?: string;
      status?: string;
      parent_task_id?: string;
    },
  ): Promise<TaskDto[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        participants: { some: { user_id: actor_id } },
        creator_id: filters?.creator_id,
        assignee_id: filters?.assignee_id,
        status: filters?.status,
        parent_task_id: filters?.parent_task_id,
      },
    });
    return tasks.map((t) => this.toDto(t));
  }

  async updateTaskStatus(
    id: string,
    to_status: string,
    changed_by: string,
    reason?: string,
  ): Promise<TaskDto> {
    if (!VALID_STATUSES.includes(to_status)) {
      throw new BadRequestException(`Invalid status: ${to_status}`);
    }

    const task = await this.requireTask(id);
    this.assertCanModifyTask(task, changed_by);

    const updated = await this.prisma.task.update({
      where: { id },
      data: { status: to_status, previous_status: task.status },
    });

    // Record status change
    await this.prisma.taskStatusHistory.create({
      data: {
        task_id: id,
        from_status: task.status,
        to_status,
        changed_by,
        reason: reason || null,
      },
    });

    // Record activity
    await this.prisma.taskActivity.create({
      data: {
        task_id: id,
        activity_type: 'STATUS_CHANGE',
        actor_id: changed_by,
        summary: `Status changed from ${task.status} to ${to_status}`,
        metadata: { from_status: task.status, to_status, reason },
      },
    });

    return this.toDto(updated);
  }

  async assignTask(id: string, assignee_id: string, assigned_by: string): Promise<TaskDto> {
    const task = await this.requireTask(id);
    this.assertCreator(task, assigned_by);

    const updated = await this.prisma.task.update({
      where: { id },
      data: { assignee_id },
    });

    // Add assignee as participant if not already
    await this.prisma.taskParticipant.upsert({
      where: { task_id_user_id: { task_id: id, user_id: assignee_id } },
      update: {},
      create: {
        task_id: id,
        user_id: assignee_id,
        role: 'ASSIGNEE',
      },
    });

    // Record activity
    await this.prisma.taskActivity.create({
      data: {
        task_id: id,
        activity_type: 'ASSIGNMENT',
        actor_id: assigned_by,
        summary: `Task assigned to ${assignee_id}`,
      },
    });

    return this.toDto(updated);
  }

  async blockTask(id: string, blocked_reason: string, blocked_by: string): Promise<TaskDto> {
    const task = await this.requireTask(id);
    this.assertCanModifyTask(task, blocked_by);

    const updated = await this.prisma.task.update({
      where: { id },
      data: { blocked: true, blocked_reason, status: 'BLOCKED' },
    });

    // Record activity
    await this.prisma.taskActivity.create({
      data: {
        task_id: id,
        activity_type: 'BLOCKED',
        actor_id: blocked_by,
        summary: `Task blocked: ${blocked_reason}`,
      },
    });

    return this.toDto(updated);
  }

  async unblockTask(id: string, unblocked_by: string): Promise<TaskDto> {
    const task = await this.requireTask(id);
    this.assertCanModifyTask(task, unblocked_by);
    if (!task.blocked) throw new BadRequestException('Task is not blocked');

    const updated = await this.prisma.task.update({
      where: { id },
      data: { blocked: false, blocked_reason: null },
    });

    // Record activity
    await this.prisma.taskActivity.create({
      data: {
        task_id: id,
        activity_type: 'UNBLOCKED',
        actor_id: unblocked_by,
        summary: 'Task unblocked',
      },
    });

    return this.toDto(updated);
  }

  async addParticipant(
    task_id: string,
    user_id: string,
    added_by: string,
    role: string = 'PARTICIPANT',
  ): Promise<TaskParticipantDto> {
    const task = await this.requireTask(task_id);
    this.assertCreator(task, added_by);

    try {
      const participant = await this.prisma.taskParticipant.create({
        data: { task_id, user_id, role },
      });
      return this.participantToDto(participant);
    } catch {
      throw new ConflictException('User is already a participant');
    }
  }

  async getParticipants(task_id: string, actor_id: string): Promise<TaskParticipantDto[]> {
    await this.assertDirectParticipant(task_id, actor_id);
    const participants = await this.prisma.taskParticipant.findMany({ where: { task_id } });
    return participants.map((p) => this.participantToDto(p));
  }

  async getComments(task_id: string, actor_id: string): Promise<TaskCommentDto[]> {
    await this.assertDirectParticipant(task_id, actor_id);
    const comments = await this.prisma.taskComment.findMany({
      where: { task_id },
      orderBy: { created_at: 'asc' },
    });
    return comments.map((comment) => ({
      id: comment.id,
      task_id: comment.task_id,
      author_id: comment.author_id,
      content: comment.content,
      created_at: comment.created_at.toISOString(),
    }));
  }

  async addComment(
    task_id: string,
    author_id: string,
    content: string,
  ): Promise<{ id: string; created_at: string }> {
    await this.assertDirectParticipant(task_id, author_id);
    await this.requireTask(task_id);

    const comment = await this.prisma.taskComment.create({
      data: { task_id, author_id, content },
    });

    // Record activity
    await this.prisma.taskActivity.create({
      data: {
        task_id,
        activity_type: 'COMMENT',
        actor_id: author_id,
        summary: `Comment added: ${content.substring(0, 50)}`,
      },
    });

    return { id: comment.id, created_at: comment.created_at.toISOString() };
  }

  async submitTaskResult(
    task_id: string,
    author_id: string,
    content: string,
  ): Promise<{ id: string; status: string; created_at: string }> {
    const task = await this.requireTask(task_id);
    if (task.assignee_id !== author_id) {
      throw new ForbiddenException('Only the current assignee may submit');
    }

    const submission = await this.prisma.taskSubmission.create({
      data: {
        task_id,
        author_id,
        content,
        status: 'PENDING',
      },
    });

    // Record activity
    await this.prisma.taskActivity.create({
      data: {
        task_id,
        activity_type: 'SUBMISSION',
        actor_id: author_id,
        summary: 'Task result submitted for review',
      },
    });

    return {
      id: submission.id,
      status: submission.status,
      created_at: submission.created_at.toISOString(),
    };
  }

  async reviewSubmission(
    submission_id: string,
    reviewer_id: string,
    approved: boolean,
    comment?: string,
  ): Promise<{ id: string; status: string }> {
    const submission = await this.prisma.taskSubmission.findUnique({
      where: { id: submission_id },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    const task = await this.requireTask(submission.task_id);
    this.assertCreator(task, reviewer_id);

    const newStatus = approved ? 'APPROVED' : 'REJECTED';
    const updated = await this.prisma.taskSubmission.update({
      where: { id: submission_id },
      data: {
        status: newStatus,
        reviewer_id,
        review_comment: comment || null,
        reviewed_at: new Date(),
      },
    });

    // Record activity on the task
    await this.prisma.taskActivity.create({
      data: {
        task_id: submission.task_id,
        activity_type: 'REVIEW_DECISION',
        actor_id: reviewer_id,
        summary: `Submission ${approved ? 'approved' : 'rejected'}`,
      },
    });

    // Update task result if approved
    if (approved) {
      await this.prisma.task.update({
        where: { id: submission.task_id },
        data: { result: submission.content },
      });
    }

    return { id: updated.id, status: updated.status };
  }

  async getTaskActivity(
    task_id: string,
    actor_id: string,
  ): Promise<
    Array<{
      id: string;
      activity_type: string;
      actor_id: string;
      summary: string;
      created_at: string;
    }>
  > {
    await this.assertDirectParticipant(task_id, actor_id);
    const activities = await this.prisma.taskActivity.findMany({
      where: { task_id },
      orderBy: { created_at: 'asc' },
    });
    return activities.map((a) => ({
      id: a.id,
      activity_type: a.activity_type,
      actor_id: a.actor_id,
      summary: a.summary,
      created_at: a.created_at.toISOString(),
    }));
  }

  private toDto(task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    creator_id: string;
    assignee_id: string | null;
    parent_task_id: string | null;
    deadline: Date | null;
    blocked: boolean;
    blocked_reason: string | null;
    result: string | null;
    created_at: Date;
    updated_at: Date;
  }): TaskDto {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      creator_id: task.creator_id,
      assignee_id: task.assignee_id,
      parent_task_id: task.parent_task_id,
      deadline: task.deadline?.toISOString() ?? null,
      blocked: task.blocked,
      blocked_reason: task.blocked_reason,
      result: task.result,
      created_at: task.created_at.toISOString(),
      updated_at: task.updated_at.toISOString(),
    };
  }

  private participantToDto(p: {
    id: string;
    task_id: string;
    user_id: string;
    role: string;
    added_at: Date;
  }): TaskParticipantDto {
    return {
      id: p.id,
      task_id: p.task_id,
      user_id: p.user_id,
      role: p.role,
      added_at: p.added_at.toISOString(),
    };
  }

  private async requireTask(id: string): Promise<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    creator_id: string;
    assignee_id: string | null;
    parent_task_id: string | null;
    deadline: Date | null;
    blocked: boolean;
    blocked_reason: string | null;
    result: string | null;
    created_at: Date;
    updated_at: Date;
  }> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async assertDirectParticipant(task_id: string, user_id: string): Promise<void> {
    const participant = await this.prisma.taskParticipant.findUnique({
      where: { task_id_user_id: { task_id, user_id } },
    });
    if (!participant) {
      throw new ForbiddenException('Direct task participation is required');
    }
  }

  private assertCanModifyTask(
    task: { creator_id: string; assignee_id: string | null },
    user_id: string,
  ): void {
    if (task.creator_id !== user_id && task.assignee_id !== user_id) {
      throw new ForbiddenException('Only the task creator or current assignee may modify the task');
    }
  }

  private assertCreator(task: { creator_id: string }, user_id: string): void {
    if (task.creator_id !== user_id) {
      throw new ForbiddenException('Only the task creator may perform this action');
    }
  }
}
