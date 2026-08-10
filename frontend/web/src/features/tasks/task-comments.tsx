'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/api/admin';
import { tasksApi } from '@/api/tasks';
import type { MemberOption } from '@/types/admin';
import type { AncestorTaskSummary, Task, TaskComment } from '@/types/task';
import { ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import { GatewayError } from '@/lib/errors';
import styles from './task-comments.module.css';

const isSummary = (value: Task | AncestorTaskSummary): value is AncestorTaskSummary => !('id' in value);
const initials = (value: string) => value.split(/[@ ._-]/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U';
const statusLabel = (value: string) => ({ CREATED: 'Mới tạo', ASSIGNED: 'Đã giao', IN_PROGRESS: 'Đang làm', WAITING_REVIEW: 'Chờ phê duyệt', APPROVED: 'Đã phê duyệt', NEED_REVISION: 'Cần chỉnh sửa', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy' } as Record<string, string>)[value] ?? value;

export function TaskComments({ id }: { id: string }) {
  const [task, setTask] = useState<Task | AncestorTaskSummary | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [error, setError] = useState<number>();
  const [notice, setNotice] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);

  const load = () => {
    setTask(null);
    setError(undefined);
    setLoadingComments(true);
    tasksApi.get(id).then(async result => {
      setTask(result);
      if (isSummary(result)) return;
      const [commentResult, memberResult] = await Promise.allSettled([tasksApi.comments(id), adminApi.directory()]);
      if (commentResult.status === 'fulfilled') setComments(commentResult.value);
      else setError(commentResult.reason instanceof GatewayError ? commentResult.reason.status : 503);
      if (memberResult.status === 'fulfilled') setMembers(memberResult.value);
      setLoadingComments(false);
    }).catch(reason => { setError(reason instanceof GatewayError ? reason.status : 503); setLoadingComments(false); });
  };
  useEffect(load, [id]);

  if (error === 403) return <PermissionDeniedState />;
  if (error) return <ErrorState message="Không thể tải bình luận của công việc." onRetry={load} />;
  if (!task) return <LoadingState />;
  if (isSummary(task)) return <section className={styles.summaryOnly}><Link href={`/tasks/${id}`}>← Quay lại task</Link><h1>{task.title}</h1><p>Task tổ tiên chỉ cho phép xem tổng quan; không có luồng bình luận trực tiếp.</p></section>;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const content = String(new FormData(form).get('content') ?? '').trim();
    if (!content) return;
    try {
      await tasksApi.comment(task.id, content);
      form.reset();
      setNotice('Đã đăng bình luận.');
      const refreshed = await tasksApi.comments(task.id);
      setComments(refreshed);
    } catch (reason) {
      setNotice(reason instanceof GatewayError && reason.status === 403 ? 'Bạn không có quyền bình luận trong task này.' : 'Không thể đăng bình luận.');
    }
  };
  const memberName = (authorId: string) => members.find(member => member.id === authorId)?.email ?? `Người dùng ${authorId.slice(0, 8)}`;

  return <section className={styles.page}>
    <div className={styles.breadcrumb}><Link href="/tasks">Công việc</Link><span>›</span><Link href={`/tasks/${task.id}`}>{task.title}</Link><span>›</span><strong>Bình luận</strong></div>
    <header className={styles.header}><div><p className={styles.eyebrow}>Trao đổi chính thức</p><h1>Bình luận</h1><p>Trao đổi được lưu riêng theo task để mọi người theo dõi đúng ngữ cảnh công việc.</p></div><Link className={styles.backLink} href={`/tasks/${task.id}`}>← Về chi tiết task</Link></header>
    <section className={styles.taskContext}><div><span>Task</span><strong>{task.title}</strong></div><span className={styles.status}>{statusLabel(task.status)}</span></section>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.commentLayout}>
      <section className={styles.thread} aria-labelledby="comments-title"><div className={styles.threadHeader}><div><h2 id="comments-title">Trao đổi trong task</h2><p>{comments.length} bình luận</p></div><span className={styles.threadMark}>⌁</span></div>{loadingComments ? <p className={styles.empty}>Đang tải bình luận…</p> : comments.length === 0 ? <div className={styles.empty}><strong>Chưa có bình luận</strong><span>Hãy bắt đầu trao đổi đầu tiên với những người tham gia task.</span></div> : <div className={styles.commentList}>{comments.map(item => <article className={styles.comment} key={item.id}><span className={styles.avatar}>{initials(memberName(item.author_id))}</span><div><div className={styles.commentMeta}><strong>{memberName(item.author_id)}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('vi-VN')}</time></div><p>{item.content}</p></div></article>)}</div>}</section>
      <aside className={styles.composer}><h2>Viết bình luận</h2><p>Thông tin trao đổi sẽ tạo thêm hoạt động trong task.</p><form onSubmit={submit}><label htmlFor="task-comment-content">Viết bình luận<textarea id="task-comment-content" name="content" required placeholder="Chia sẻ cập nhật, câu hỏi hoặc phản hồi…" /></label><button type="submit">Đăng bình luận</button></form></aside>
    </div>
  </section>;
}
