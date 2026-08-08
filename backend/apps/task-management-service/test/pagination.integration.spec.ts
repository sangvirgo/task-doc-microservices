import { TasksService } from '../src/tasks/tasks.service';

const ACTOR_ID = '10000000-0000-4000-8000-000000000001';

function taskRecord() {
  const now = new Date('2026-08-07T00:00:00.000Z');
  return {
    id: '20000000-0000-4000-8000-000000000002',
    title: 'Paginated task',
    description: 'Task',
    status: 'IN_PROGRESS',
    creator_id: ACTOR_ID,
    assignee_id: null,
    parent_task_id: null,
    deadline: null,
    blocked: false,
    blocked_reason: null,
    previous_status: null,
    result: null,
    created_at: now,
    updated_at: now,
  };
}

describe('TasksService pagination', () => {
  it('counts and bounds the authorized task query', async () => {
    const prisma = {
      task: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([taskRecord()]),
      },
    };
    const service = new TasksService(prisma as never);

    const result = await service.listTasks(
      ACTOR_ID,
      { status: 'IN_PROGRESS' },
      { page: 2, page_size: 2 },
    );

    expect(prisma.task.count).toHaveBeenCalledWith({
      where: {
        participants: { some: { user_id: ACTOR_ID } },
        creator_id: undefined,
        assignee_id: undefined,
        status: 'IN_PROGRESS',
        parent_task_id: undefined,
      },
    });
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        participants: { some: { user_id: ACTOR_ID } },
        creator_id: undefined,
        assignee_id: undefined,
        status: 'IN_PROGRESS',
        parent_task_id: undefined,
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: 2,
      take: 2,
    });
    expect(result).toEqual({
      items: [expect.objectContaining({ id: taskRecord().id })],
      pagination: {
        page: 2,
        page_size: 2,
        total: 3,
        total_pages: 2,
        has_next: false,
        has_previous: true,
      },
    });
  });
});
