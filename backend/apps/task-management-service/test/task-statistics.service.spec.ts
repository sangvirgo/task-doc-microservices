import { ForbiddenException } from '@nestjs/common';

import { TaskStatisticsService } from '../src/tasks/task-statistics.service';

const EMPLOYEE_ID = '10000000-0000-4000-8000-000000000001';

describe('TaskStatisticsService', () => {
  const prisma = {
    task: { findMany: jest.fn() },
    taskActivity: { findMany: jest.fn() },
    taskStatusHistory: { findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('aggregates statuses, overdue tasks, completion trend, and recent activity', async () => {
    const service = new TaskStatisticsService(prisma as never);
    const overdue = new Date(Date.now() - 60_000);
    const createdAt = new Date('2026-08-03T10:00:00.000Z');
    const completedAt = new Date('2026-08-04T10:00:00.000Z');

    prisma.task.findMany
      .mockResolvedValueOnce([{ id: 'task-1' }, { id: 'task-2' }])
      .mockResolvedValueOnce([
        { id: 'task-1', status: 'IN_PROGRESS', deadline: overdue, created_at: createdAt },
        { id: 'task-2', status: 'APPROVED', deadline: overdue, created_at: createdAt },
      ]);
    prisma.taskStatusHistory.findMany.mockResolvedValueOnce([{ created_at: completedAt }]);
    prisma.taskActivity.findMany.mockResolvedValueOnce([
      {
        id: 'activity-1',
        activity_type: 'TASK_ASSIGNED',
        summary: 'Task assigned',
        created_at: completedAt,
      },
    ]);

    const result = await service.getOverview({
      scope: 'ME',
      from: new Date('2026-08-01T00:00:00.000Z'),
      toExclusive: new Date('2026-08-11T00:00:00.000Z'),
      caller: {
        userId: EMPLOYEE_ID,
        role: 'EMPLOYEE',
        capabilities: [],
        sessionId: '',
      },
    });

    expect(result.summary).toMatchObject({
      total_tasks: 2,
      in_progress_tasks: 1,
      approved_tasks: 1,
      overdue_tasks: 1,
    });
    expect(result.task_status).toMatchObject({ IN_PROGRESS: 1, APPROVED: 1 });
    expect(result.task_trend).toEqual(
      expect.arrayContaining([
        { date: '2026-08-03', created: 2, completed: 0 },
        { date: '2026-08-04', created: 0, completed: 1 },
      ]),
    );
    expect(result.recent_activity).toEqual([
      {
        id: 'activity-1',
        type: 'TASK_ASSIGNED',
        message: 'Task assigned',
        created_at: completedAt.toISOString(),
      },
    ]);
  });

  it('rejects employee organization aggregation before reading Prisma', async () => {
    const service = new TaskStatisticsService(prisma as never);

    await expect(
      service.getOverview({
        scope: 'ORGANIZATION',
        from: new Date('2026-08-01T00:00:00.000Z'),
        toExclusive: new Date('2026-08-11T00:00:00.000Z'),
        caller: {
          userId: EMPLOYEE_ID,
          role: 'EMPLOYEE',
          capabilities: [],
          sessionId: '',
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });
});
