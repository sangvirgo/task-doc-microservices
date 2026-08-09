import { ForbiddenException } from '@nestjs/common';

import { TasksService } from '../src/tasks/tasks.service';

const CREATOR_ID = '10000000-0000-4000-8000-000000000001';
const ASSIGNEE_ID = '10000000-0000-4000-8000-000000000002';
const REVIEWER_ID = '10000000-0000-4000-8000-000000000003';
const TASK_ID = '20000000-0000-4000-8000-000000000004';
const SUBMISSION_ID = '30000000-0000-4000-8000-000000000005';

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    title: 'Task under test',
    description: 'Description',
    status: 'WAITING_REVIEW',
    creator_id: CREATOR_ID,
    assignee_id: ASSIGNEE_ID,
    reviewer_id: CREATOR_ID,
    parent_task_id: null,
    deadline: new Date('2026-08-12T09:00:00.000Z'),
    blocked: false,
    blocked_reason: null,
    previous_status: null,
    result: null,
    created_at: new Date('2026-08-01T09:00:00.000Z'),
    updated_at: new Date('2026-08-01T09:00:00.000Z'),
    ...overrides,
  };
}

function makeService() {
  const tx = {
    task: { update: jest.fn().mockResolvedValue(task()) },
    taskStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    taskActivity: { create: jest.fn().mockResolvedValue({}) },
    taskParticipant: { upsert: jest.fn().mockResolvedValue({}) },
    taskSubmission: {
      update: jest.fn().mockResolvedValue({ id: SUBMISSION_ID, status: 'NEED_REVISION' }),
    },
    outboxEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    task: {
      findUnique: jest.fn().mockResolvedValue(task()),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(task()),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    taskParticipant: { findUnique: jest.fn().mockResolvedValue({ id: 'participant-1' }) },
    taskSubmission: {
      findUnique: jest.fn().mockResolvedValue({
        id: SUBMISSION_ID,
        task_id: TASK_ID,
        author_id: ASSIGNEE_ID,
        content: 'Submission',
        status: 'PENDING',
        reviewer_id: null,
        review_comment: null,
        reviewed_at: null,
        created_at: new Date('2026-08-08T09:00:00.000Z'),
      }),
      findFirst: jest.fn().mockResolvedValue({ id: SUBMISSION_ID }),
    },
    $transaction: jest.fn((callback: (value: typeof tx) => unknown) => callback(tx)),
  };

  return { service: new TasksService(prisma as never), prisma, tx };
}

describe('TasksService review and metadata rules', () => {
  it('rejects metadata updates by anyone except the creator', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.updateTaskMetadata(TASK_ID, ASSIGNEE_ID, { title: 'Changed' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a deadline-change event when the creator edits the deadline', async () => {
    const { service, tx } = makeService();
    tx.task.update.mockResolvedValue(task({ deadline: new Date('2026-08-15T09:00:00.000Z') }));

    await service.updateTaskMetadata(
      TASK_ID,
      CREATOR_ID,
      { deadline: new Date('2026-08-15T09:00:00.000Z') },
      '40000000-0000-4000-8000-000000000006',
    );

    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event_type: 'task.deadline.changed', task_id: TASK_ID }),
      }),
    );
  });

  it('uses the explicit reviewer for a review and emits a review event', async () => {
    const { service, prisma, tx } = makeService();
    prisma.task.findUnique.mockResolvedValue(task({ reviewer_id: REVIEWER_ID }));

    const result = await service.reviewSubmission(
      SUBMISSION_ID,
      REVIEWER_ID,
      'NEED_REVISION',
      'Please revise the result',
    );

    expect(result).toEqual({ id: SUBMISSION_ID, status: 'NEED_REVISION' });
    expect(tx.taskSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SUBMISSION_ID },
        data: expect.objectContaining({ reviewer_id: REVIEWER_ID, status: 'NEED_REVISION' }),
      }),
    );
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event_type: 'task.reviewed', resource_id: SUBMISSION_ID }),
      }),
    );
  });
});
