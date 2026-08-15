import { NotificationDetail } from '@/features/notifications/notification-detail';

export default async function NotificationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NotificationDetail id={id} />;
}
