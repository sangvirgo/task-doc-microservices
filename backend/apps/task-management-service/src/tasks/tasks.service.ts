import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

import {
  createPaginationMeta,
  EventType,
  PaginatedResponse,
  PaginationQuery,
  Producer,
  toPrismaPagination,
} from '@c17/contracts';

import { TaskPrismaService } from '../prisma/task-prisma.service';
import { calculateTaskProgress, CompletionColor } from './task-progress';

const CANONICAL_STATUSES = [
  'CREATED',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_REVIEW',
  'APPROVED',
  'NEED_REVISION',
  'REJECTED',
  'CANCELLED',
] as const;

const TERMINAL_STATUSES = new Set<TaskStatus>(['APPROVED', 'REJECTED', 'CANCELLED']);
const RESOLVED_STATUSES = new Set<TaskStatus>(['APPROVED', 'REJECTED', 'CANCELLED']);
const REVIEW_DECISIONS = ['APPROVED', 'NEED_REVISION', 'REJECTED'] as const;

const STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  CREATED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_REVIEW', 'CANCELLED'],
  WAITING_REVIEW: ['APPROVED', 'NEED_REVISION', 'REJECTED', 'CANCELLED'],
  APPROVED: [],
  NEED_REVISION: ['IN_PROGRESS', 'CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
};

type TaskStatus = (typeof CANONICAL_STATUSES)[number];
type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  creator_id: string;
  assignee_id: string | null;
  reviewer_id: string | null;
  parent_task_id: string | null;
  deadline: Date | null;
  blocked: boolean;
  blocked_reason: string | null;
  previous_status: string | null;
  result: string | null;
  created_at: Date;
  updated_at: Date;
};

type TaskTransaction = Pick<
  TaskPrismaService,
  | 'task'
  | 'taskStatusHistory'
  | 'taskActivity'
  | 'taskParticipant'
  | 'taskSubmission'
  | 'outboxEvent'
>;

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  status: string;
  creator_id: string;
  assignee_id: string | null;
  reviewer_id: string | null;
  parent_task_id: string | null;
  deadline: string | null;
  blocked: boolean;
  blocked_reason: string | null;
  result: string | null;
  is_overdue: boolean;
  completion_percentage: number;
  child_task_count: number;
  approved_child_task_count: number;
  completion_color: CompletionColor;
  created_at: string;
  updated_at: string;
  children: TaskChildSummaryDto[];
}

export interface TaskChildSummaryDto {
  id: string;
  title: string;
  status: string;
  creator_id: string;
  assignee_id: string | null;
  reviewer_id: string | null;
  deadline: string | null;
  is_overdue: boolean;
}

export interface TaskParticipantDto {
  id: string;
  task_id: string;
  user_id: string;
  role: string;
  added_at: string;
}

export interface TaskContextDto {
  task: TaskDto;
  participants: TaskParticipantDto[];
}

export interface AncestorTaskSummaryDto {
  title: string;
  status: string;
  assignee: string | null;
  deadline: string | null;
  is_overdue: boolean;
  completion_result: string | null;
}

export interface TaskCommentDto {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export interface TaskActivityDto {
  id: string;
  activity_type: string;
  actor_id: string;
  summary: string;
  created_at: string;
}

export interface TaskSubmissionDto {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  status: string;
  reviewer_id: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const DEFAULT_PAGINATION: PaginationQuery = { page: 1, page_size: 20 };

@Injectable()
export class TasksService {
  constructor(private readonly prisma: TaskPrismaService) {}

  async getTaskContext(id: string): Promise<TaskContextDto> {
    const task = await this.requireTask(id);
    const childStatuses = await this.getChildStatuses(id);
    const participants = await this.prisma.taskParticipant.findMany({
      where: { task_id: id },
      orderBy: { added_at: 'asc' },
    });

    return {
      task: this.toDto(task, childStatuses),
      participants: participants.map((participant) => this.participantToDto(participant)),
    };
  }

  async createTask(data: {
    title: string;
    description?: string;
    creator_id: string;
    assignee_id?: string;
    reviewer_id?: string | null;
    parent_task_id?: string;
    deadline?: Date;
    correlation_id?: string;
  }): Promise<TaskDto> {
    if (data.parent_task_id) {
      const parent = await this.requireTask(data.parent_task_id);
      await this.assertDirectParticipant(parent.id, data.creator_id);
    }

    const reviewerId = data.reviewer_id ?? data.creator_id;
    this.assertDistinctAssigneeAndReviewer(data.assignee_id, reviewerId);

    const initialStatus: TaskStatus = data.assignee_id ? 'ASSIGNED' : 'CREATED';
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          title: data.title,
          description: data.description || null,
          creator_id: data.creator_id,
          reviewer_id: reviewerId,
          assignee_id: data.assignee_id || null,
          parent_task_id: data.parent_task_id || null,
          deadline: data.deadline || null,
          status: initialStatus,
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

      if (reviewerId !== data.creator_id) {
        await tx.taskParticipant.upsert({
          where: { task_id_user_id: { task_id: created.id, user_id: reviewerId } },
          update: { role: 'REVIEWER' },
          create: {
            task_id: created.id,
            user_id: reviewerId,
            role: 'REVIEWER',
          },
        });
      }

      if (data.correlation_id) {
        await tx.outboxEvent.create({
          data: {
            task_id: created.id,
            event_id: randomUUID(),
            event_type: EventType.TASK_CREATED,
            correlation_id: data.correlation_id,
            producer: Producer.TASK_MANAGEMENT_SERVICE,
            actor_id: data.creator_id,
            resource_type: 'TASK',
            resource_id: created.id,
            payload: {
              title: created.title,
              assignee_id: created.assignee_id,
              deadline: created.deadline?.toISOString() ?? null,
            },
            occurred_at: new Date(),
          },
        });
      }

      return created;
    });

    return this.toDto(task, await this.getChildStatuses(task.id));
  }

  async getTask(id: string, actor_id: string): Promise<TaskDto | AncestorTaskSummaryDto> {
    const task = await this.requireTask(id);

    if (await this.hasDirectParticipation(id, actor_id)) {
      return this.toDto(task, await this.getChildStatuses(id), await this.getChildSummaries(id));
    }

    if (await this.hasAncestorOversight(task, actor_id)) {
      return this.toAncestorSummary(task);
    }

    throw new ForbiddenException('Direct task participation is required');
  }

  async listTasks(
    actor_id: string,
    filters?: {
      creator_id?: string;
      assignee_id?: string;
      status?: string;
      parent_task_id?: string;
    },
    pagination: PaginationQuery = DEFAULT_PAGINATION,
  ): Promise<PaginatedResponse<TaskDto>> {
    const where = {
      participants: { some: { user_id: actor_id } },
      creator_id: filters?.creator_id,
      assignee_id: filters?.assignee_id,
      status: filters?.status,
      parent_task_id: filters?.parent_task_id,
    };
    const { skip, take } = toPrismaPagination(pagination);
    const [total, tasks] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);
    const childStatusesByTaskId = await this.getChildStatusesByTaskIds(
      tasks.map((task) => task.id),
    );

    return {
      items: tasks.map((task) => this.toDto(task, childStatusesByTaskId.get(task.id) ?? [])),
      pagination: createPaginationMeta(pagination.page, pagination.page_size, total),
    };
  }

  async updateTaskMetadata(
    id: string,
    changed_by: string,
    data: { title?: string; description?: string | null; deadline?: Date | null },
    correlation_id: string = randomUUID(),
  ): Promise<TaskDto> {
    const task = await this.requireTask(id);
    this.assertCreator(task, changed_by);

    if (data.title === undefined && data.description === undefined && data.deadline === undefined) {
      throw new BadRequestException('At least one task field must be changed');
    }
    if (data.title !== undefined && !data.title.trim()) {
      throw new BadRequestException('Task title is required');
    }

    const deadlineChanged =
      data.deadline !== undefined &&
      (task.deadline?.getTime() ?? null) !== (data.deadline?.getTime() ?? null);
    const updated = await this.prisma.$transaction(async (tx) => {
      const nextTask = await tx.task.update({
        where: { id },
        data: {
          ...(data.title !== undefined ? { title: data.title.trim() } : {}),
          ...(data.description !== undefined
            ? { description: data.description?.trim() || null }
            : {}),
          ...(data.deadline !== undefined ? { deadline: data.deadline } : {}),
        },
      });

      await tx.taskActivity.create({
        data: {
          task_id: id,
          activity_type: 'TASK_UPDATED',
          actor_id: changed_by,
          summary: 'Task metadata updated',
          metadata: {
            title_changed: data.title !== undefined,
            description_changed: data.description !== undefined,
            deadline_changed: deadlineChanged,
          },
        },
      });

      if (deadlineChanged && nextTask.deadline) {
        await tx.outboxEvent.create({
          data: {
            task_id: id,
            event_id: randomUUID(),
            event_type: EventType.TASK_DEADLINE_CHANGED,
            correlation_id,
            producer: Producer.TASK_MANAGEMENT_SERVICE,
            actor_id: changed_by,
            resource_type: 'TASK',
            resource_id: id,
            payload: {
              task_id: id,
              old_deadline: task.deadline?.toISOString() ?? null,
              deadline: nextTask.deadline.toISOString(),
              new_deadline: nextTask.deadline.toISOString(),
            },
            occurred_at: new Date(),
          },
        });
      }

      return nextTask;
    });

    return this.toDto(updated, await this.getChildStatuses(id), await this.getChildSummaries(id));
  }

  async assignReviewer(id: string, reviewer_id: string, assigned_by: string): Promise<TaskDto> {
    const task = await this.requireTask(id);
    this.assertCreator(task, assigned_by);
    this.assertDistinctAssigneeAndReviewer(task.assignee_id, reviewer_id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextTask = await tx.task.update({ where: { id }, data: { reviewer_id } });
      if (reviewer_id !== nextTask.creator_id) {
        await tx.taskParticipant.upsert({
          where: { task_id_user_id: { task_id: id, user_id: reviewer_id } },
          update: { role: 'REVIEWER' },
          create: { task_id: id, user_id: reviewer_id, role: 'REVIEWER' },
        });
      }
      await tx.taskActivity.create({
        data: {
          task_id: id,
          activity_type: 'REVIEWER_ASSIGNED',
          actor_id: assigned_by,
          summary: `Task reviewer assigned to ${reviewer_id}`,
          metadata: { reviewer_id },
        },
      });
      return nextTask;
    });

    return this.toDto(updated, await this.getChildStatuses(id), await this.getChildSummaries(id));
  }

  async updateTaskStatus(
    id: string,
    to_status: string,
    changed_by: string,
    reason?: string,
  ): Promise<TaskDto> {
    const nextStatus = this.parseStatus(to_status);
    const task = await this.requireTask(id);

    this.assertNotBlocked(task);
    this.assertTransitionAllowed(task.status, nextStatus);

    if (nextStatus === 'CANCELLED') {
      this.assertCreator(task, changed_by);
    } else if (nextStatus !== 'IN_PROGRESS') {
      throw new BadRequestException(
        `Status ${nextStatus} must be changed through the dedicated task workflow`,
      );
    }

    if (nextStatus === 'IN_PROGRESS') {
      if (task.assignee_id !== changed_by) {
        throw new ForbiddenException('Only the current assignee may resume or start work');
      }
      if (task.status !== 'ASSIGNED' && task.status !== 'NEED_REVISION') {
        throw new BadRequestException(
          `Invalid lifecycle transition: ${task.status} -> ${nextStatus}`,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) =>
      this.applyLifecycleChange(
        tx,
        task,
        nextStatus,
        changed_by,
        reason,
        'STATUS_CHANGE',
        `Status changed from ${task.status} to ${nextStatus}`,
      ),
    );

    return this.toDto(updated, await this.getChildStatuses(id));
  }

  async assignTask(id: string, assignee_id: string, assigned_by: string): Promise<TaskDto> {
    const task = await this.requireTask(id);
    this.assertCreator(task, assigned_by);
    this.assertDistinctAssigneeAndReviewer(assignee_id, task.reviewer_id ?? task.creator_id);
    this.assertNotBlocked(task);
    this.assertNotTerminal(task.status);

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextTask = await tx.task.update({
        where: { id },
        data: {
          assignee_id,
          status: 'ASSIGNED',
        },
      });

      await tx.taskParticipant.upsert({
        where: { task_id_user_id: { task_id: id, user_id: assignee_id } },
        update: { role: 'ASSIGNEE' },
        create: {
          task_id: id,
          user_id: assignee_id,
          role: 'ASSIGNEE',
        },
      });

      if (task.status !== 'ASSIGNED') {
        await tx.taskStatusHistory.create({
          data: {
            task_id: id,
            from_status: task.status,
            to_status: 'ASSIGNED',
            changed_by: assigned_by,
            reason: null,
          },
        });
      }

      await tx.taskActivity.create({
        data: {
          task_id: id,
          activity_type: 'ASSIGNMENT',
          actor_id: assigned_by,
          summary: `Task assigned to ${assignee_id}`,
          metadata: {
            assignee_id,
            from_status: task.status,
            to_status: nextTask.status,
          },
        },
      });

      return nextTask;
    });

    return this.toDto(updated, await this.getChildStatuses(id));
  }

  async blockTask(id: string, blocked_reason: string, blocked_by: string): Promise<TaskDto> {
    const task = await this.requireTask(id);
    this.assertCanModifyTask(task, blocked_by);
    this.assertNotTerminal(task.status);

    const normalizedReason = blocked_reason.trim();
    if (!normalizedReason) {
      throw new BadRequestException('Blocked reason is required');
    }
    if (task.blocked) {
      throw new BadRequestException('Task is already blocked');
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        blocked: true,
        blocked_reason: normalizedReason,
        previous_status: task.status,
      },
    });

    await this.prisma.taskActivity.create({
      data: {
        task_id: id,
        activity_type: 'BLOCKED',
        actor_id: blocked_by,
        summary: `Task blocked: ${normalizedReason}`,
        metadata: { blocked_reason: normalizedReason, previous_status: task.status },
      },
    });

    return this.toDto(updated, await this.getChildStatuses(id));
  }

  async unblockTask(id: string, unblocked_by: string): Promise<TaskDto> {
    const task = await this.requireTask(id);
    this.assertCanModifyTask(task, unblocked_by);
    if (!task.blocked) {
      throw new BadRequestException('Task is not blocked');
    }

    const restoredStatus = task.previous_status ?? task.status;
    this.parseStatus(restoredStatus);

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: restoredStatus,
        blocked: false,
        blocked_reason: null,
        previous_status: null,
      },
    });

    await this.prisma.taskActivity.create({
      data: {
        task_id: id,
        activity_type: 'UNBLOCKED',
        actor_id: unblocked_by,
        summary: 'Task unblocked',
        metadata: { restored_status: restoredStatus },
      },
    });

    return this.toDto(updated, await this.getChildStatuses(id));
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

  async getParticipants(
    task_id: string,
    actor_id: string,
    pagination: PaginationQuery = DEFAULT_PAGINATION,
  ): Promise<PaginatedResponse<TaskParticipantDto>> {
    await this.assertDirectParticipant(task_id, actor_id);
    const where = { task_id };
    const { skip, take } = toPrismaPagination(pagination);
    const [total, participants] = await Promise.all([
      this.prisma.taskParticipant.count({ where }),
      this.prisma.taskParticipant.findMany({
        where,
        orderBy: [{ added_at: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
    ]);

    return {
      items: participants.map((participant) => this.participantToDto(participant)),
      pagination: createPaginationMeta(pagination.page, pagination.page_size, total),
    };
  }

  async getComments(
    task_id: string,
    actor_id: string,
    pagination: PaginationQuery = DEFAULT_PAGINATION,
  ): Promise<PaginatedResponse<TaskCommentDto>> {
    await this.assertDirectParticipant(task_id, actor_id);
    const where = { task_id };
    const { skip, take } = toPrismaPagination(pagination);
    const [total, comments] = await Promise.all([
      this.prisma.taskComment.count({ where }),
      this.prisma.taskComment.findMany({
        where,
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
    ]);

    return {
      items: comments.map((comment) => ({
        id: comment.id,
        task_id: comment.task_id,
        author_id: comment.author_id,
        content: comment.content,
        created_at: comment.created_at.toISOString(),
      })),
      pagination: createPaginationMeta(pagination.page, pagination.page_size, total),
    };
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
    this.assertNotBlocked(task);

    if (task.assignee_id !== author_id) {
      throw new ForbiddenException('Only the current assignee may submit');
    }
    if (task.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        `Task must be IN_PROGRESS before submission; received ${task.status}`,
      );
    }

    const submission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskSubmission.create({
        data: {
          task_id,
          author_id,
          content,
          status: 'PENDING',
        },
      });

      await this.applyLifecycleChange(
        tx,
        task,
        'WAITING_REVIEW',
        author_id,
        null,
        'SUBMISSION',
        'Task result submitted for review',
      );

      await tx.outboxEvent.create({
        data: {
          task_id,
          event_id: randomUUID(),
          event_type: EventType.TASK_SUBMITTED,
          correlation_id: randomUUID(),
          producer: Producer.TASK_MANAGEMENT_SERVICE,
          actor_id: author_id,
          resource_type: 'TASK_SUBMISSION',
          resource_id: created.id,
          payload: {
            task_id,
            submission_id: created.id,
            author_id,
            reviewer_id: task.reviewer_id ?? task.creator_id,
            title: task.title,
          },
          occurred_at: new Date(),
        },
      });

      return created;
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
    decision: ReviewDecision,
    comment?: string,
    expected_task_id?: string,
  ): Promise<{ id: string; status: string }> {
    const normalizedDecision = this.parseReviewDecision(decision);
    const submission = await this.prisma.taskSubmission.findUnique({
      where: { id: submission_id },
    });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const task = await this.requireTask(submission.task_id);
    if (expected_task_id && task.id !== expected_task_id) {
      throw new NotFoundException('Submission does not belong to this task');
    }
    const designatedReviewer = task.reviewer_id ?? task.creator_id;
    if (designatedReviewer !== reviewer_id) {
      throw new ForbiddenException('Only the configured task reviewer may review');
    }
    this.assertNotBlocked(task);

    if (task.status !== 'WAITING_REVIEW') {
      throw new BadRequestException(
        `Task must be WAITING_REVIEW before review; received ${task.status}`,
      );
    }

    if (submission.status !== 'PENDING') {
      throw new BadRequestException('Only a PENDING submission may be reviewed');
    }

    const latestPending = await this.prisma.taskSubmission.findFirst({
      where: { task_id: task.id, status: 'PENDING' },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (!latestPending || latestPending.id !== submission.id) {
      throw new BadRequestException('Only the latest pending submission may be reviewed');
    }

    if (normalizedDecision === 'APPROVED') {
      await this.assertAllChildTasksApproved(task.id);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextSubmission = await tx.taskSubmission.update({
        where: { id: submission_id },
        data: {
          status: normalizedDecision,
          reviewer_id,
          review_comment: comment || null,
          reviewed_at: new Date(),
        },
      });

      await this.applyLifecycleChange(
        tx,
        task,
        normalizedDecision,
        reviewer_id,
        comment,
        'REVIEW_DECISION',
        `Submission ${normalizedDecision.toLowerCase().replace('_', ' ')}`,
        normalizedDecision === 'APPROVED' ? submission.content : task.result,
      );

      await tx.outboxEvent.create({
        data: {
          task_id: task.id,
          event_id: randomUUID(),
          event_type: EventType.TASK_REVIEWED,
          correlation_id: randomUUID(),
          producer: Producer.TASK_MANAGEMENT_SERVICE,
          actor_id: reviewer_id,
          resource_type: 'TASK_SUBMISSION',
          resource_id: submission_id,
          payload: {
            task_id: task.id,
            submission_id,
            author_id: submission.author_id,
            reviewer_id,
            decision: normalizedDecision,
            title: task.title,
          },
          occurred_at: new Date(),
        },
      });

      return nextSubmission;
    });

    return { id: updated.id, status: updated.status };
  }

  async getSubmissions(
    task_id: string,
    actor_id: string,
    pagination: PaginationQuery = DEFAULT_PAGINATION,
  ): Promise<PaginatedResponse<TaskSubmissionDto>> {
    const task = await this.requireTask(task_id);
    const canReview = (task.reviewer_id ?? task.creator_id) === actor_id;
    const isCreator = task.creator_id === actor_id;
    const isSubmitter = await this.prisma.taskSubmission.findFirst({
      where: { task_id, author_id: actor_id },
      select: { id: true },
    });
    if (!canReview && !isCreator && !isSubmitter) {
      throw new ForbiddenException('Submission access is restricted to submitter and reviewer');
    }

    const where = { task_id };
    const [total, submissions] = await Promise.all([
      this.prisma.taskSubmission.count({ where }),
      this.prisma.taskSubmission.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        ...toPrismaPagination(pagination),
      }),
    ]);
    return {
      items: submissions.map((submission) => this.submissionToDto(submission)),
      pagination: createPaginationMeta(pagination.page, pagination.page_size, total),
    };
  }

  async getSubmission(
    task_id: string,
    submission_id: string,
    actor_id: string,
  ): Promise<TaskSubmissionDto> {
    const submissions = await this.getSubmissions(task_id, actor_id, { page: 1, page_size: 100 });
    const submission = submissions.items.find((item) => item.id === submission_id);
    if (!submission) throw new NotFoundException('Submission not found');
    return submission;
  }

  async getTaskActivity(
    task_id: string,
    actor_id: string,
    pagination: PaginationQuery = DEFAULT_PAGINATION,
  ): Promise<PaginatedResponse<TaskActivityDto>> {
    await this.assertDirectParticipant(task_id, actor_id);
    const where = { task_id };
    const { skip, take } = toPrismaPagination(pagination);
    const [total, activities] = await Promise.all([
      this.prisma.taskActivity.count({ where }),
      this.prisma.taskActivity.findMany({
        where,
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
    ]);

    return {
      items: activities.map((activity) => ({
        id: activity.id,
        activity_type: activity.activity_type,
        actor_id: activity.actor_id,
        summary: activity.summary,
        created_at: activity.created_at.toISOString(),
      })),
      pagination: createPaginationMeta(pagination.page, pagination.page_size, total),
    };
  }

  private toDto(
    task: TaskRecord,
    childStatuses: readonly string[] = [],
    children: TaskChildSummaryDto[] = [],
  ): TaskDto {
    const progress = calculateTaskProgress(task.status, childStatuses);

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      creator_id: task.creator_id,
      assignee_id: task.assignee_id,
      reviewer_id: task.reviewer_id,
      parent_task_id: task.parent_task_id,
      deadline: task.deadline?.toISOString() ?? null,
      blocked: task.blocked,
      blocked_reason: task.blocked_reason,
      result: task.result,
      is_overdue: this.isOverdue(task),
      ...progress,
      created_at: task.created_at.toISOString(),
      updated_at: task.updated_at.toISOString(),
      children,
    };
  }

  private submissionToDto(submission: {
    id: string;
    task_id: string;
    author_id: string;
    content: string;
    status: string;
    reviewer_id: string | null;
    review_comment: string | null;
    reviewed_at: Date | null;
    created_at: Date;
  }): TaskSubmissionDto {
    return {
      id: submission.id,
      task_id: submission.task_id,
      author_id: submission.author_id,
      content: submission.content,
      status: submission.status,
      reviewer_id: submission.reviewer_id,
      review_comment: submission.review_comment,
      reviewed_at: submission.reviewed_at?.toISOString() ?? null,
      created_at: submission.created_at.toISOString(),
    };
  }

  private toAncestorSummary(task: TaskRecord): AncestorTaskSummaryDto {
    return {
      title: task.title,
      status: task.status,
      assignee: task.assignee_id,
      deadline: task.deadline?.toISOString() ?? null,
      is_overdue: this.isOverdue(task),
      completion_result: task.result,
    };
  }

  private participantToDto(participant: {
    id: string;
    task_id: string;
    user_id: string;
    role: string;
    added_at: Date;
  }): TaskParticipantDto {
    return {
      id: participant.id,
      task_id: participant.task_id,
      user_id: participant.user_id,
      role: participant.role,
      added_at: participant.added_at.toISOString(),
    };
  }

  private async requireTask(id: string): Promise<TaskRecord> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  private async getChildStatuses(taskId: string): Promise<string[]> {
    const children = await this.prisma.task.findMany({
      where: { parent_task_id: taskId },
      select: { status: true },
    });

    return children.map((child) => child.status);
  }

  private async getChildSummaries(taskId: string): Promise<TaskChildSummaryDto[]> {
    const children = await this.prisma.task.findMany({
      where: { parent_task_id: taskId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

    return children.map((child) => ({
      id: child.id,
      title: child.title,
      status: child.status,
      creator_id: child.creator_id,
      assignee_id: child.assignee_id,
      reviewer_id: child.reviewer_id,
      deadline: child.deadline?.toISOString() ?? null,
      is_overdue: this.isOverdue(child),
    }));
  }

  private async getChildStatusesByTaskIds(
    taskIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    if (taskIds.length === 0) {
      return new Map();
    }

    const children = await this.prisma.task.findMany({
      where: { parent_task_id: { in: [...taskIds] } },
      select: { parent_task_id: true, status: true },
    });
    const statusesByTaskId = new Map<string, string[]>();

    for (const child of children) {
      if (!child.parent_task_id) {
        continue;
      }

      const statuses = statusesByTaskId.get(child.parent_task_id) ?? [];
      statuses.push(child.status);
      statusesByTaskId.set(child.parent_task_id, statuses);
    }

    return statusesByTaskId;
  }

  private async assertDirectParticipant(task_id: string, user_id: string): Promise<void> {
    if (!(await this.hasDirectParticipation(task_id, user_id))) {
      throw new ForbiddenException('Direct task participation is required');
    }
  }

  private async hasDirectParticipation(task_id: string, user_id: string): Promise<boolean> {
    const participant = await this.prisma.taskParticipant.findUnique({
      where: { task_id_user_id: { task_id, user_id } },
    });

    return Boolean(participant);
  }

  private async hasAncestorOversight(task: TaskRecord, actor_id: string): Promise<boolean> {
    let ancestorTaskId = task.parent_task_id;

    while (ancestorTaskId) {
      const ancestor = await this.requireTask(ancestorTaskId);
      if (ancestor.creator_id === actor_id || ancestor.assignee_id === actor_id) {
        return true;
      }
      ancestorTaskId = ancestor.parent_task_id;
    }

    return false;
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

  private assertDistinctAssigneeAndReviewer(
    assigneeId: string | null | undefined,
    reviewerId: string | null | undefined,
  ): void {
    if (assigneeId && reviewerId && assigneeId === reviewerId) {
      throw new BadRequestException('The assignee and reviewer must be different users');
    }
  }

  private assertNotBlocked(task: { blocked: boolean }): void {
    if (task.blocked) {
      throw new BadRequestException(
        'Task is blocked and must be unblocked before changing workflow state',
      );
    }
  }

  private assertNotTerminal(status: string): void {
    if (this.isTerminalStatus(status)) {
      throw new BadRequestException(`Task is already terminal with status ${status}`);
    }
  }

  private assertTransitionAllowed(fromStatus: string, toStatus: TaskStatus): void {
    const currentStatus = this.parseStatus(fromStatus);
    if (!STATUS_TRANSITIONS[currentStatus].includes(toStatus)) {
      throw new BadRequestException(
        `Invalid lifecycle transition: ${currentStatus} -> ${toStatus}`,
      );
    }
  }

  private parseStatus(status: string): TaskStatus {
    if ((CANONICAL_STATUSES as readonly string[]).includes(status)) {
      return status as TaskStatus;
    }

    throw new BadRequestException(`Invalid status: ${status}`);
  }

  private parseReviewDecision(decision: string): ReviewDecision {
    if ((REVIEW_DECISIONS as readonly string[]).includes(decision)) {
      return decision as ReviewDecision;
    }

    throw new BadRequestException(`Invalid review decision: ${decision}`);
  }

  private isTerminalStatus(status: string): boolean {
    return TERMINAL_STATUSES.has(this.parseStatus(status));
  }

  private isOverdue(task: { deadline: Date | null; status: string }): boolean {
    if (!task.deadline) {
      return false;
    }

    return (
      task.deadline.getTime() < Date.now() && !RESOLVED_STATUSES.has(this.parseStatus(task.status))
    );
  }

  private async assertAllChildTasksApproved(taskId: string): Promise<void> {
    const incompleteChildren = await this.prisma.task.findFirst({
      where: {
        parent_task_id: taskId,
        status: { not: 'APPROVED' },
      },
      select: { id: true, status: true },
    });

    if (incompleteChildren) {
      throw new BadRequestException(
        'Parent task cannot be approved while any child task is not APPROVED',
      );
    }
  }

  private async applyLifecycleChange(
    tx: TaskTransaction,
    task: TaskRecord,
    toStatus: TaskStatus,
    changedBy: string,
    reason: string | undefined | null,
    activityType: string,
    summary: string,
    result?: string | null,
  ): Promise<TaskRecord> {
    const updated = await tx.task.update({
      where: { id: task.id },
      data: {
        status: toStatus,
        previous_status: task.status,
        ...(result !== undefined ? { result } : {}),
      },
    });

    await tx.taskStatusHistory.create({
      data: {
        task_id: task.id,
        from_status: task.status,
        to_status: toStatus,
        changed_by: changedBy,
        reason: reason || null,
      },
    });

    await tx.taskActivity.create({
      data: {
        task_id: task.id,
        activity_type: activityType,
        actor_id: changedBy,
        summary,
        metadata: {
          from_status: task.status,
          to_status: toStatus,
          reason: reason || null,
        },
      },
    });

    return updated;
  }
}
