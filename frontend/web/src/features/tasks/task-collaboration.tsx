'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tasksApi } from '@/api/tasks';
import type { MemberOption } from '@/types/admin';
import type { Activity, TaskComment } from '@/types/task';
import styles from './task-collaboration.module.css';

type Tab = 'comments' | 'activity';
type PageState<T> = { items: T[]; page: number; total?: number; hasNext: boolean; initialized: boolean; loading: boolean; error: string; retryPage?: number };

const emptyPage = <T,>(): PageState<T> => ({ items: [], page: 0, hasNext: false, initialized: false, loading: false, error: '' });
const initials = (value: string) => value.split(/[@ ._-]/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U';
const formatDateTime = (value: string) => new Date(value).toLocaleString('vi-VN');

interface TaskCollaborationProps {
  taskId: string;
  members: MemberOption[];
  mode?: 'both' | 'comments';
}

export function TaskCollaboration({ taskId, members, mode = 'both' }: TaskCollaborationProps) {
  const [activeTab, setActiveTab] = useState<Tab>('comments');
  const [comments, setComments] = useState<PageState<TaskComment>>(emptyPage);
  const [activity, setActivity] = useState<PageState<Activity>>(emptyPage);
  const [notice, setNotice] = useState('');
  const sentinelRef = useRef<HTMLDivElement>(null);
  const memberName = useCallback((userId: string) => members.find(member => member.id === userId)?.email ?? `Người dùng ${userId.slice(0, 8)}`, [members]);

  const loadComments = useCallback(async (page: number, replace = false) => {
    setComments(current => ({ ...current, loading: true, error: '', retryPage: undefined }));
    try {
      const result = await tasksApi.commentsPage(taskId, page, 20);
      setComments(current => {
        const existing = replace ? [] : current.items;
        const merged = [...existing, ...result.items].filter((item, index, all) => all.findIndex(candidate => candidate.id === item.id) === index);
        return { items: merged, page: result.pagination.page, total: result.pagination.total, hasNext: result.pagination.has_next, initialized: true, loading: false, error: '' };
      });
    } catch {
      setComments(current => ({ ...current, loading: false, error: 'Không thể tải bình luận.', retryPage: page }));
    }
  }, [taskId]);

  const loadActivity = useCallback(async (page: number, replace = false) => {
    setActivity(current => ({ ...current, loading: true, error: '', retryPage: undefined }));
    try {
      const result = await tasksApi.activityPage(taskId, page, 20);
      setActivity(current => {
        const existing = replace ? [] : current.items;
        const merged = [...existing, ...result.items].filter((item, index, all) => all.findIndex(candidate => candidate.id === item.id) === index);
        return { items: merged, page: result.pagination.page, total: result.pagination.total, hasNext: result.pagination.has_next, initialized: true, loading: false, error: '' };
      });
    } catch {
      setActivity(current => ({ ...current, loading: false, error: 'Không thể tải dòng thời gian.', retryPage: page }));
    }
  }, [taskId]);

  useEffect(() => {
    setActiveTab('comments');
    setComments(emptyPage());
    setActivity(emptyPage());
    setNotice('');
    void loadComments(1, true);
  }, [loadComments, taskId]);

  const selectTab = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'activity' && !activity.initialized && !activity.loading) void loadActivity(1, true);
  };

  const current = activeTab === 'comments' ? comments : activity;
  const loadMore = () => {
    if (current.loading || !current.hasNext) return;
    if (activeTab === 'comments') void loadComments(current.page + 1);
    else void loadActivity(current.page + 1);
  };

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || (mode === 'comments' && activeTab === 'activity') || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) loadMore(); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [activeTab, comments.hasNext, comments.loading, activity.hasNext, activity.loading, mode]);

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const content = String(new FormData(form).get('content') ?? '').trim();
    if (!content) return;
    try {
      await tasksApi.comment(taskId, content);
      form.reset();
      setNotice('Đã đăng bình luận.');
      await loadComments(1, true);
    } catch {
      setNotice('Không thể đăng bình luận.');
    }
  };

  const commentCount = comments.total ?? comments.items.length;
  const activityCount = activity.total ?? activity.items.length;
  const commentPanel = useMemo(() => <>
    <div className={styles.threadHeader}><div><h3>Trao đổi trong task</h3><p>{commentCount} bình luận</p></div><span className={styles.threadMark} aria-hidden="true">⌁</span></div>
    {comments.error && <div className={styles.error} role="alert"><span>{comments.error}</span><button type="button" onClick={() => void loadComments(comments.retryPage ?? 1, !comments.initialized)}>Thử lại</button></div>}
    {comments.loading && !comments.initialized ? <p className={styles.empty}>Đang tải bình luận…</p> : comments.items.length === 0 ? <div className={styles.empty}><strong>Chưa có bình luận</strong><span>Hãy bắt đầu trao đổi đầu tiên trong task.</span></div> : <div className={styles.commentList}>{comments.items.map(item => <article className={styles.comment} key={item.id}><span className={styles.avatar}>{initials(memberName(item.author_id))}</span><div><div className={styles.commentMeta}><strong>{memberName(item.author_id)}</strong><time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time></div><p>{item.content}</p></div></article>)}</div>}
    {comments.loading && comments.initialized && <p className={styles.loading}>Đang tải thêm…</p>}
    {!comments.loading && comments.initialized && !comments.hasNext && comments.items.length > 0 && <p className={styles.end}>Đã hiển thị hết bình luận.</p>}
  </>, [commentCount, comments, loadComments, memberName]);

  const activityPanel = <>
    <div className={styles.threadHeader}><div><h3>Hoạt động trong task</h3><p>{activityCount} cập nhật</p></div><span className={styles.threadMark} aria-hidden="true">◷</span></div>
    {activity.error && <div className={styles.error} role="alert"><span>{activity.error}</span><button type="button" onClick={() => void loadActivity(activity.retryPage ?? 1, !activity.initialized)}>Thử lại</button></div>}
    {activity.loading && !activity.initialized ? <p className={styles.empty}>Đang tải dòng thời gian…</p> : activity.items.length === 0 ? <p className={styles.empty}>Chưa có hoạt động.</p> : <div className={styles.timeline}>{activity.items.map(item => <article key={item.id}><span className={styles.avatar}>{initials(memberName(item.actor_id))}</span><div><strong>{item.summary}</strong><small>{item.activity_type} · {memberName(item.actor_id)}</small><time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time></div></article>)}</div>}
    {activity.loading && activity.initialized && <p className={styles.loading}>Đang tải thêm…</p>}
    {!activity.loading && activity.initialized && !activity.hasNext && activity.items.length > 0 && <p className={styles.end}>Đã hiển thị hết dòng thời gian.</p>}
  </>;

  return <section className={styles.section} aria-labelledby="task-collaboration-title">
    <div className={styles.heading}><div><p className={styles.eyebrow}>Trao đổi &amp; cập nhật</p><h2 id="task-collaboration-title">Hoạt động trong task</h2></div>{notice && <span className={styles.notice} role="status">{notice}</span>}</div>
    {mode === 'both' && <div className={styles.tabs} role="tablist" aria-label="Trao đổi trong task"><button type="button" role="tab" aria-selected={activeTab === 'comments'} onClick={() => selectTab('comments')}>Bình luận <span>{commentCount}</span></button><button type="button" role="tab" aria-selected={activeTab === 'activity'} onClick={() => selectTab('activity')}>Dòng thời gian <span>{activityCount}</span></button></div>}
    <div className={styles.layout}><section className={styles.thread} aria-label={activeTab === 'comments' ? 'Bình luận' : 'Dòng thời gian'}>{activeTab === 'comments' || mode === 'comments' ? commentPanel : activityPanel}<div ref={sentinelRef} data-testid="collaboration-load-more" className={styles.sentinel}>{current.hasNext && !current.loading ? <button type="button" onClick={loadMore}>Tải thêm</button> : null}</div></section>{(activeTab === 'comments' || mode === 'comments') && <aside className={styles.composer}><h3>Viết bình luận</h3><p>Trao đổi được lưu lại cùng task.</p><form onSubmit={submitComment}><label htmlFor={`task-comment-${taskId}`}>Nội dung<textarea id={`task-comment-${taskId}`} name="content" required placeholder="Chia sẻ cập nhật, câu hỏi hoặc phản hồi…" /></label><button type="submit">Đăng bình luận</button></form></aside>}</div>
  </section>;
}
