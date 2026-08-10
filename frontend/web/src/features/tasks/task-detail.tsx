'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { tasksApi } from '@/api/tasks';
import { readSession } from '@/auth/session';
import { adminApi } from '@/api/admin';
import type { MemberOption } from '@/types/admin';
import { ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import { GatewayError } from '@/lib/errors';
import { TaskDocuments } from './task-documents';
import { TaskChildren } from './task-children';
import type { Activity, AncestorTaskSummary, CreateTaskInput, Participant, Task, TaskComment, TaskSubmission } from '@/types/task';
import styles from './task-detail.module.css';
import { SearchableSelect } from '@/components/searchable-select';
import { TaskAssignmentDrawer } from './task-assignment-drawer';

const isSummary = (value: Task | AncestorTaskSummary): value is AncestorTaskSummary => !('id' in value);
const message = (error: unknown, fallback: string) => error instanceof GatewayError && error.status === 409 ? 'Công việc đã thay đổi. Tải lại và thử lại.' : fallback;
const statusLabel = (value: string) => ({ CREATED: 'Mới tạo', ASSIGNED: 'Đã giao', IN_PROGRESS: 'Đang làm', WAITING_REVIEW: 'Chờ phê duyệt', APPROVED: 'Đã phê duyệt', NEED_REVISION: 'Cần chỉnh sửa', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy' } as Record<string, string>)[value] ?? value;
const initials = (value: string) => value.split(/[@ ._-]/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U';

export function TaskDetail({ id }: { id: string }) {
  const [task, setTask] = useState<Task | AncestorTaskSummary | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
  const [error, setError] = useState<number>();

  const load = () => {
    setError(undefined);
    setTask(null);
    setComments([]);
    setActivity([]);
    setParticipants([]);
    setSubmissions([]);
    tasksApi.get(id).then(async result => {
      setTask(result);
      if (isSummary(result)) return;

      const [participantResult, activityResult, commentResult] = await Promise.allSettled([
        tasksApi.participants(id),
        tasksApi.activity(id),
        tasksApi.comments(id),
      ]);
      if (participantResult.status === 'fulfilled') setParticipants(participantResult.value);
      if (activityResult.status === 'fulfilled') setActivity(activityResult.value);
      if (commentResult.status === 'fulfilled') setComments(commentResult.value);
      if (tasksApi.submissions) tasksApi.submissions(id).then(setSubmissions).catch(() => setSubmissions([]));
    }).catch((reason: unknown) => setError(reason instanceof GatewayError ? reason.status : 503));
  };
  useEffect(load, [id]);

  useEffect(() => {
    let cancelled = false;
    const refreshDirectory = () => { adminApi.directory().then(items => { if (!cancelled) setMembers(items); }).catch(() => undefined); };
    refreshDirectory();
    window.addEventListener('focus', refreshDirectory);
    const timer = window.setInterval(refreshDirectory, 15_000);
    return () => { cancelled = true; window.removeEventListener('focus', refreshDirectory); window.clearInterval(timer); };
  }, []);

  if (error === 403) return <PermissionDeniedState />;
  if (error) return <ErrorState message="Không thể tải chi tiết công việc." onRetry={load} />;
  if (!task) return <LoadingState />;
  if (isSummary(task)) return <section className={styles.summaryOnly}><h1>{task.title}</h1><p><strong>Ancestor oversight: summary only.</strong> Chỉ xem tổng quan task tổ tiên; bình luận, hoạt động, người tham gia và tài liệu chỉ khả dụng ở task trực tiếp.</p><dl><dt>Trạng thái</dt><dd>{statusLabel(task.status)}</dd><dt>Người được giao</dt><dd>{task.assignee ?? 'Chưa giao'}</dd><dt>Deadline</dt><dd>{task.deadline ?? '—'}</dd><dt>Quá hạn</dt><dd>{task.is_overdue ? 'Có' : 'Không'}</dd><dt>Kết quả</dt><dd>{task.completion_result ?? '—'}</dd></dl></section>;
  return <DirectTask task={task} comments={comments} activity={activity} participants={participants} submissions={submissions} members={members} reload={load} />;
}

function DirectTask({ task, comments, activity, participants, submissions, members, reload }: { task: Task; comments: TaskComment[]; activity: Activity[]; participants: Participant[]; submissions: TaskSubmission[]; members: MemberOption[]; reload: () => void }) {
  const [notice, setNotice] = useState('');
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [creatingSubtask, setCreatingSubtask] = useState(false);
  const [subtaskError, setSubtaskError] = useState('');
  const act = async (work: () => Promise<unknown>, success: string, fallback: string) => { try { await work(); setNotice(success); reload(); } catch (error) { setNotice(message(error, fallback)); } };
  const assign = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const assigneeId = String(new FormData(event.currentTarget).get('assignee_id')); void act(() => tasksApi.assign(task.id, assigneeId), 'Đã cập nhật người được giao.', 'Không thể cập nhật người được giao.'); };
  const participant = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void act(() => tasksApi.addParticipant(task.id, String(data.get('user_id')), String(data.get('role')) || undefined), 'Đã thêm người tham gia.', 'Không thể thêm người tham gia.'); form.reset(); };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const content = String(new FormData(event.currentTarget).get('content')); void act(() => tasksApi.submit(task.id, content), 'Đã nộp kết quả để duyệt.', 'Không thể nộp kết quả.'); };
  const review = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act(() => tasksApi.review(task.id, String(data.get('submission_id')), String(data.get('decision')) as 'APPROVED' | 'NEED_REVISION' | 'REJECTED', String(data.get('comment')) || undefined), 'Đã ghi nhận phê duyệt.', 'Không thể ghi nhận phê duyệt.'); };
  const createSubtask = async (input: CreateTaskInput) => {
    setSubtaskError('');
    setCreatingSubtask(true);
    try { await tasksApi.create({ ...input, parent_task_id: task.id }); setSubtaskOpen(false); setNotice('Đã tạo sub-task trong công việc này.'); } catch { setSubtaskError('Không thể tạo sub-task. Kiểm tra thông tin và thử lại.'); } finally { setCreatingSubtask(false); }
  };

  const assignee = members.find(member => member.id === task.assignee_id);
  const currentUserId = readSession()?.userId;
  const isCreator = currentUserId === task.creator_id;
  const isAssignee = currentUserId === task.assignee_id;
  const isParticipant = Boolean(currentUserId && (isCreator || isAssignee || participants.some(participantItem => participantItem.user_id === currentUserId)));
  const canReview = task.status === 'WAITING_REVIEW' && currentUserId === (task.reviewer_id ?? task.creator_id);
  const canSubmit = task.status === 'IN_PROGRESS' && isAssignee;
  const assignableMembers = currentUserId ? members.filter(member => member.id !== currentUserId) : members;
  const finalState = ['APPROVED', 'REJECTED', 'CANCELLED'].includes(task.status);
  const canCreateSubtask = isParticipant && !finalState;
  const canCancelTask = !finalState && !isAssignee;
  const nextStep = task.blocked ? 'Cần bỏ chặn trước khi tiếp tục.' : task.status === 'ASSIGNED' ? 'Người thực hiện có thể bắt đầu công việc.' : task.status === 'IN_PROGRESS' ? 'Hoàn tất nội dung rồi nộp để phê duyệt.' : task.status === 'WAITING_REVIEW' ? 'Người review cần xử lý submission mới nhất.' : task.status === 'NEED_REVISION' ? 'Cần chỉnh sửa rồi bắt đầu lại.' : finalState ? 'Công việc đã kết thúc.' : 'Theo dõi tiến độ và phối hợp cùng người tham gia.';
  const memberName = (userId: string) => members.find(member => member.id === userId)?.email ?? userId.slice(0, 8);

  return <section className={styles.page}>
    <div className={styles.breadcrumb}><Link href="/tasks">Công việc</Link><b>›</b><span>{task.id.slice(0, 8)}</span></div>
    <div className={styles.layout}>
      <div className={styles.mainColumn}>
        <header className={styles.taskHeader}><p className={styles.taskEyebrow}>Chi tiết công việc</p><h1>{task.title}</h1><p>{task.description || 'Chưa có mô tả cho công việc này.'}</p></header>
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        <section className={styles.overviewCard}><h2>Tổng quan tiến độ</h2><div><article><span>Trạng thái</span><strong>{statusLabel(task.status)}</strong></article><article><span>Tiến độ</span><strong>{task.blocked ? 'Đang bị chặn' : task.is_overdue ? 'Quá hạn' : 'Đúng tiến độ'}</strong></article><article><span>Cập nhật</span><strong>{new Date(task.updated_at).toLocaleDateString('vi-VN')}</strong></article></div></section>

        <section className={styles.workflowCard} aria-labelledby="workflow-title"><div className={styles.workflowHeader}><div><p className={styles.taskEyebrow}>Bước tiếp theo</p><h2 id="workflow-title">Xử lý công việc</h2><p>{nextStep}</p></div><span className={`${styles.statusBadge} ${styles[task.status.toLowerCase()]}`}>{statusLabel(task.status)}</span></div>{(canSubmit || canReview) ? <div className={styles.workflowGrid}>
          {canSubmit && <form className={styles.workflowForm} onSubmit={submit}><h3>Nộp kết quả</h3><p>Gửi nội dung hoàn thành để người review xử lý.</p><label>Kết quả<textarea name="content" required placeholder="Mô tả kết quả hoặc đính kèm tài liệu ở phần bên dưới…" /></label><button type="submit">Nộp để phê duyệt</button></form>}
          {canReview && <form className={styles.workflowForm} onSubmit={review}><h3>Phê duyệt submission</h3><p>Chỉ submission mới nhất ở trạng thái chờ mới được xử lý.</p><label>Submission<SearchableSelect name="submission_id" required defaultValue=""><option value="" disabled>Chọn submission</option>{submissions.filter(item => item.status === 'PENDING').map(item => <option key={item.id} value={item.id}>{new Date(item.created_at).toLocaleString('vi-VN')} · {item.status}</option>)}</SearchableSelect></label>{submissions.filter(item => item.status === 'PENDING').length === 0 && <small className={styles.inlineHint}>Chưa có submission đang chờ.</small>}<label>Quyết định<SearchableSelect name="decision" defaultValue="APPROVED"><option value="APPROVED">Phê duyệt</option><option value="NEED_REVISION">Yêu cầu chỉnh sửa</option><option value="REJECTED">Từ chối</option></SearchableSelect></label><label>Nhận xét <span>Tùy chọn</span><input name="comment" placeholder="Ghi chú cho người thực hiện" /></label><button type="submit" disabled={submissions.filter(item => item.status === 'PENDING').length === 0}>Ghi nhận quyết định</button></form>}
        </div> : <div className={styles.workflowHint}><span>✓</span><div><strong>{finalState ? 'Workflow đã hoàn tất' : 'Chưa có thao tác cần xử lý'}</strong><p>{task.status === 'CREATED' ? 'Task cần được giao trước khi bắt đầu.' : 'Bạn vẫn có thể theo dõi hoạt động, tài liệu và trao đổi của task.'}</p></div></div>}{submissions.length > 0 && <div className={styles.submissionList}><strong>Lịch sử submission</strong>{submissions.slice(0, 3).map(item => <div className={styles.submissionItem} key={item.id}><span>{new Date(item.created_at).toLocaleString('vi-VN')}</span><b>{item.status}</b><small>{item.content}</small></div>)}</div>}</section>

        <TaskDocuments task={task} />
        <TaskChildren parentId={task.id} />
        <section className={styles.activityCard} aria-labelledby="task-activity-title"><div className={styles.sectionHeading}><div><p className={styles.taskEyebrow}>Dòng thời gian</p><h2 id="task-activity-title">Hoạt động trong task</h2></div><span>{activity.length} cập nhật</span></div><div className={styles.timeline}>{activity.length === 0 ? <p className={styles.emptyText}>Chưa có hoạt động.</p> : activity.map(item => <article key={item.id}><span className={styles.timelineAvatar}>{initials(memberName(item.actor_id))}</span><div><div><strong>{item.summary}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('vi-VN')}</time></div><small>{item.activity_type} · {memberName(item.actor_id)}</small></div></article>)}</div></section>
        <section className={styles.commentsCard} aria-labelledby="comments-summary-title"><div><p className={styles.taskEyebrow}>Trao đổi chính thức</p><h2 id="comments-summary-title">Bình luận</h2><p>{comments.length === 0 ? 'Chưa có trao đổi trong task.' : `${comments.length} bình luận đang được lưu theo task.`}</p></div><Link className={styles.commentLink} href={`/tasks/${task.id}/comments`}>Mở trang bình luận <span>→</span></Link></section>
      </div>

      <aside className={styles.sideRail}>
        <section className={styles.railCard}>
          <div className={styles.railStatus}><span>Trạng thái</span><strong className={`${styles.statusBadge} ${styles[task.status.toLowerCase()]}`}>{task.blocked ? 'BLOCKED' : statusLabel(task.status)}</strong></div>
          {isAssignee && (task.status === 'ASSIGNED' || task.status === 'NEED_REVISION') && <button className={styles.startButton} onClick={() => void act(() => tasksApi.status(task.id, 'IN_PROGRESS'), 'Đã bắt đầu công việc.', 'Không thể bắt đầu công việc.')}>Bắt đầu làm</button>}
          <button className={styles.subtaskButton} type="button" disabled={!canCreateSubtask} aria-expanded={subtaskOpen} onClick={() => { setSubtaskError(''); setSubtaskOpen(value => !value); }}>＋ Tạo sub-task</button>
          {!canCreateSubtask && <p className={styles.inlineHint}>Chỉ người tham gia trực tiếp task cha mới có thể tạo sub-task.</p>}
          {subtaskOpen && <TaskAssignmentDrawer currentUserId={currentUserId ?? ''} members={members} parentTask={{ id: task.id, title: task.title }} submitting={creatingSubtask} error={subtaskError} onSubmit={createSubtask} onClose={() => setSubtaskOpen(false)} />}
          <div className={styles.railBody}>
            <div className={styles.metaBlock}><span>Người thực hiện</span><div className={styles.person}><i>{initials(assignee?.email || 'U')}</i><strong>{assignee?.email || 'Chưa giao'}</strong></div><form className={!isCreator ? styles.hidden : undefined} onSubmit={assign}><SearchableSelect name="assignee_id" aria-label="Chọn người thực hiện" defaultValue={task.assignee_id ?? ''} required><option value="">Chọn nhân viên</option>{assignableMembers.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</SearchableSelect><button type="submit">Cập nhật</button></form></div>
            <div className={styles.metaBlock}><span>Hạn hoàn thành</span><strong>◷ {task.deadline ? new Date(task.deadline).toLocaleString('vi-VN') : 'Chưa đặt'}</strong></div>
            <div className={styles.metaBlock}><span>Người liên quan</span><div className={styles.participantChips}>{participants.map(item => { const member = members.find(option => option.id === item.user_id); return <span key={item.id} title={member?.email || item.user_id}>{initials(member?.email || item.user_id)}</span>; })}{participants.length === 0 && <small>Chưa có người tham gia</small>}</div><form className={`${styles.participantForm} ${!isCreator ? styles.hidden : ''}`} onSubmit={participant}><SearchableSelect name="user_id" aria-label="Thêm người tham gia" required defaultValue=""><option value="" disabled>Thêm người tham gia</option>{members.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</SearchableSelect><input name="role" placeholder="Vai trò (tùy chọn)" /><button type="submit">+ Thêm</button></form></div>
          </div>
          <footer className={styles.railActions}>{canCancelTask && <button type="button" onClick={() => { if (window.confirm('Hủy công việc này?')) void act(() => tasksApi.status(task.id, 'CANCELLED'), 'Đã hủy công việc.', 'Không thể hủy công việc.'); }}>Hủy nhiệm vụ</button>}<button type="button" className={styles.dangerAction} onClick={() => { const reason = window.prompt('Lý do công việc bị chặn?'); if (reason) void act(() => tasksApi.block(task.id, reason), 'Đã đánh dấu bị chặn.', 'Không thể chặn công việc.'); }}>{task.blocked ? 'Cập nhật lý do chặn' : 'Báo cáo lỗi / Chặn'}</button>{task.blocked && <button type="button" onClick={() => void act(() => tasksApi.unblock(task.id), 'Đã bỏ chặn.', 'Không thể bỏ chặn.')}>Bỏ chặn</button>}</footer>
        </section>
        <p className={styles.taskId}>ID: {task.id} · Tạo {new Date(task.created_at).toLocaleDateString('vi-VN')}</p>
      </aside>
    </div>
  </section>;
}
