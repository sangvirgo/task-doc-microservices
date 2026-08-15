import { TaskComments } from '@/features/tasks/task-comments';

export default async function TaskCommentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskComments id={id} />;
}
