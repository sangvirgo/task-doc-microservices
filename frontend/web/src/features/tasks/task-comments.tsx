'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/api/admin';
import { tasksApi } from '@/api/tasks';
import type { MemberOption } from '@/types/admin';
import type { AncestorTaskSummary, Task } from '@/types/task';
import { ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import { GatewayError } from '@/lib/errors';
import styles from './task-comments.module.css';
import { TaskCollaboration } from './task-collaboration';

const isSummary = (value: Task | AncestorTaskSummary): value is AncestorTaskSummary => !('id' in value);
const statusLabel = (value: string) => ({ CREATED: 'Mới tạo', ASSIGNED: 'Đã giao', IN_PROGRESS: 'Đang làm', WAITING_REVIEW: 'Chờ phê duyệt', APPROVED: 'Đã phê duyệt', NEED_REVISION: 'Cần chỉnh sửa', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy' } as Record<string, string>)[value] ?? value;

export function TaskComments({ id }: { id: string }) {
  const [task, setTask] = useState<Task | AncestorTaskSummary | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [error, setError] = useState<number>();

  const load = () => {
    setTask(null);
    setError(undefined);
    tasksApi.get(id).then(async result => {
      setTask(result);
      if (isSummary(result)) return;
      const memberResult = await adminApi.directory().then(items => ({ status: 'fulfilled' as const, value: items })).catch(reason => ({ status: 'rejected' as const, reason }));
      if (memberResult.status === 'fulfilled') setMembers(memberResult.value);
    }).catch(reason => { setError(reason instanceof GatewayError ? reason.status : 503); });
  };
  useEffect(load, [id]);

  if (error === 403) return <PermissionDeniedState />;
  if (error) return <ErrorState message="Không thể tải bình luận của công việc." onRetry={load} />;
  if (!task) return <LoadingState />;
  if (isSummary(task)) return <section className={styles.summaryOnly}><Link href={`/tasks/${id}`}>← Quay lại task</Link><h1>{task.title}</h1><p>Task tổ tiên chỉ cho phép xem tổng quan; không có luồng bình luận trực tiếp.</p></section>;

  return <section className={styles.page}>
    <div className={styles.breadcrumb}><Link href="/tasks">Công việc</Link><span>›</span><Link href={`/tasks/${task.id}`}>{task.title}</Link><span>›</span><strong>Bình luận</strong></div>
    <header className={styles.header}><div><p className={styles.eyebrow}>Trao đổi chính thức</p><h1>Bình luận</h1><p>Trao đổi được lưu riêng theo task để mọi người theo dõi đúng ngữ cảnh công việc.</p></div><Link className={styles.backLink} href={`/tasks/${task.id}`}>← Về chi tiết task</Link></header>
    <section className={styles.taskContext}><div><span>Task</span><strong>{task.title}</strong></div><span className={styles.status}>{statusLabel(task.status)}</span></section>
    <TaskCollaboration taskId={task.id} members={members} mode="comments" />
  </section>;
}
