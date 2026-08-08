import { NotificationsService } from '../src/notifications/notifications.service';

describe('NotificationsService pagination', () => {
  it('returns recipient notifications in a paginated envelope', async () => {
    const notification = {
      id: '20000000-0000-4000-8000-000000000001',
      recipient_id: '20000000-0000-4000-8000-000000000002',
      type: 'TASK_ASSIGNED',
      title: 'Task assigned',
      body: 'A task was assigned to you',
      channel: 'IN_APP',
      read_at: null,
      metadata: null,
      created_at: new Date('2026-08-01T00:00:00.000Z'),
    };
    const prisma = {
      notification: {
        count: jest.fn().mockResolvedValue(4),
        findMany: jest.fn().mockResolvedValue([notification]),
      },
    };
    const service = new NotificationsService(prisma as never);

    const result = await service.listNotifications(notification.recipient_id, true, {
      page: 2,
      page_size: 1,
    });

    const where = { recipient_id: notification.recipient_id, read_at: null };
    expect(prisma.notification.count).toHaveBeenCalledWith({ where });
    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: 1,
      take: 1,
    });
    expect(result.items).toHaveLength(1);
    expect(result.pagination.total_pages).toBe(4);
  });
});
