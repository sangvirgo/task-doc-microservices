'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useRef, useState } from 'react';
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
import { taskStatusClass, taskStatusLabel } from './task-status';

const isSummary = (value: Task | AncestorTaskSummary): value is AncestorTaskSummary => !('id' in value);
const message = (error: unknown, fallback: string) => error instanceof GatewayError && error.status === 409 ? 'Công việc đã thay đổi. Tải lại và thử lại.' : fallback;
const initials = (value: string) => value.split(/[@ ._-]/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U';
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Chưa đặt';
const formatDateTime = (value: string) => new Date(value).toLocaleString('vi-VN');

export function TaskDetail({ id }: { id: string }) {
  const [task, setTask] = useState<Task | AncestorTaskSummary | null>(null);
  const [parentContext, setParentContext] = useState<Task | AncestorTaskSummary | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
  const [error, setError] = useState<number>();
  const loadSequence = useRef(0);

  const load = () => {
    const sequence = ++loadSequence.current;
    const isCurrent = () => loadSequence.current === sequence;
    setError(undefined);
    setTask(null);
    setParentContext(null);
    setComments([]);
    setActivity([]);
    setParticipants([]);
    setSubmissions([]);
    tasksApi.get(id).then(async result => {
      if (!isCurrent()) return;
      setTask(result);
      if (isSummary(result)) return;

      if (result.parent_task_id) {
        tasksApi.get(result.parent_task_id)
          .then(parent => { if (isCurrent()) setParentContext(parent); })
          .catch(() => { if (isCurrent()) setParentContext(null); });
      }

      const [participantResult, activityResult, commentResult] = await Promise.allSettled([
        tasksApi.participants(id),
        tasksApi.activity(id),
        tasksApi.comments(id),
      ]);
      if (!isCurrent()) return;
      if (participantResult.status === 'fulfilled') setParticipants(participantResult.value);
      if (activityResult.status === 'fulfilled') setActivity(activityResult.value);
      if (commentResult.status === 'fulfilled') setComments(commentResult.value);
      if (tasksApi.submissions) tasksApi.submissions(id).then(submissionItems => { if (isCurrent()) setSubmissions(submissionItems); }).catch(() => { if (isCurrent()) setSubmissions([]); });
    }).catch((reason: unknown) => { if (isCurrent()) setError(reason instanceof GatewayError ? reason.status : 503); });
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
  if (isSummary(task)) return <AncestorSummary task={task} />;
  return <DirectTask task={task} parentContext={parentContext} comments={comments} activity={activity} participants={participants} submissions={submissions} members={members} reload={load} />;
}

function AncestorSummary({ task }: { task: AncestorTaskSummary }) {
  return <section className={styles.summaryOnly}>
    <Link className={styles.backLink} href="/tasks">← Công việc</Link>
    <p className={styles.summaryEyebrow}>Ancestor oversight: summary only.</p>
    <h1>{task.title}</h1>
    <p>Đây là task tổ tiên. Bình luận, hoạt động, người tham gia và tài liệu chỉ khả dụng ở task trực tiếp.</p>
    <dl><dt>Trạng thái</dt><dd>{taskStatusLabel(task.status)}</dd><dt>Người được giao</dt><dd>{task.assignee ?? 'Chưa giao'}</dd><dt>Deadline</dt><dd>{task.deadline ?? '—'}</dd><dt>Quá hạn</dt><dd>{task.is_overdue ? 'Có' : 'Không'}</dd><dt>Kết quả</dt><dd>{task.completion_result ?? '—'}</dd></dl>
  </section>;
}

function DirectTask({ task, parentContext, comments, activity, participants, submissions, members, reload }: { task: Task; parentContext: Task | AncestorTaskSummary | null; comments: TaskComment[]; activity: Activity[]; participants: Participant[]; submissions: TaskSubmission[]; members: MemberOption[]; reload: () => void }) {
  const [notice, setNotice] = useState('');
  const [pendingAction, setPendingAction] = useState(false);
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [creatingSubtask, setCreatingSubtask] = useState(false);
  const [subtaskError, setSubtaskError] = useState('');
  const act = async (work: () => Promise<unknown>, success: string, fallback: string) => {
    if (pendingAction) return;
    setPendingAction(true);
    try { await work(); setNotice(success); reload(); } catch (error) { setNotice(message(error, fallback)); } finally { setPendingAction(false); }
  };
  const assign = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const assigneeId = String(new FormData(event.currentTarget).get('assignee_id')); void act(() => tasksApi.assign(task.id, assigneeId), 'Đã cập nhật người được giao.', 'Không thể cập nhật người được giao.'); };
  const participant = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void act(() => tasksApi.addParticipant(task.id, String(data.get('user_id')), String(data.get('role')) || undefined), 'Đã thêm người tham gia.', 'Không thể thêm người tham gia.'); form.reset(); };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const content = String(new FormData(event.currentTarget).get('content')); void act(() => tasksApi.submit(task.id, content), 'Đã nộp kết quả để duyệt.', 'Không thể nộp kết quả.'); };
  const review = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act(() => tasksApi.review(task.id, String(data.get('submission_id')), String(data.get('decision')) as 'APPROVED' | 'NEED_REVISION' | 'REJECTED', String(data.get('comment')) || undefined), 'Đã ghi nhận phê duyệt.', 'Không thể ghi nhận phê duyệt.'); };
  const createSubtask = async (input: CreateTaskInput) => {
    setSubtaskError('');
    setCreatingSubtask(true);
    try { await tasksApi.create({ ...input, parent_task_id: task.id }); setSubtaskOpen(false); setNotice('Đã tạo sub-task trong công việc này.'); reload(); } catch { setSubtaskError('Không thể tạo sub-task. Kiểm tra thông tin và thử lại.'); } finally { setCreatingSubtask(false); }
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
  const canModifyTask = isCreator || isAssignee;
  const canCancelTask = !finalState && isCreator;
  const nextStep = task.blocked ? 'Cần bỏ chặn trước khi tiếp tục.' : task.status === 'ASSIGNED' ? 'Người thực hiện có thể bắt đầu công việc.' : task.status === 'IN_PROGRESS' ? 'Hoàn tất nội dung rồi nộp để phê duyệt.' : task.status === 'WAITING_REVIEW' ? 'Người review cần xử lý submission mới nhất.' : task.status === 'NEED_REVISION' ? 'Cần chỉnh sửa rồi bắt đầu lại.' : finalState ? 'Công việc đã kết thúc.' : 'Theo dõi tiến độ và phối hợp cùng người tham gia.';
  const memberName = (userId: string) => members.find(member => member.id === userId)?.email ?? userId.slice(0, 8);
  const parentTitle = parentContext?.title ?? (task.parent_task_id ? `Task ${task.parent_task_id.slice(0, 8)}` : null);
  const parentHref = parentContext && !isSummary(parentContext) ? `/tasks/${parentContext.id}` : undefined;

  return <section className={styles.page}>
    <div className={styles.drawer}>
      <header className={styles.topBar}>
        <Link className={styles.closeButton} href="/tasks" aria-label="Quay lại danh sách công việc">×</Link>
        <span className={styles.topBarTitle}>Chi tiết công việc</span>
        <div className={styles.topActions}>
          {isAssignee && (task.status === 'ASSIGNED' || task.status === 'NEED_REVISION') && <button className={styles.topAction} type="button" disabled={pendingAction} onClick={() => void act(() => tasksApi.status(task.id, 'IN_PROGRESS'), 'Đã bắt đầu công việc.', 'Không thể bắt đầu công việc.')}>Bắt đầu</button>}
          <Link className={styles.topAction} href={`/tasks/${task.id}/comments`}>Bình luận</Link>
        </div>
      </header>

      <main className={styles.content}>
        <nav className={styles.breadcrumb} aria-label="Đường dẫn công việc">
          <Link href="/tasks">Công việc</Link><span>›</span>
          {parentTitle ? <>{parentHref ? <Link href={parentHref}>{parentTitle}</Link> : <span>{parentTitle}</span>}<span>›</span></> : null}
          <span className={styles.currentCrumb}>{task.title}</span>
        </nav>

        <header className={styles.taskHeader}>
          <div className={styles.titleRow}><h1>{task.title}</h1><span className={`${styles.statusBadge} ${styles[taskStatusClass(task.status)]}`}>{task.blocked ? 'Bị chặn' : taskStatusLabel(task.status)}</span></div>
          <p className={styles.taskId}>ID: {task.id}</p>
        </header>
        {notice && <p className={styles.notice} role="status">{notice}</p>}

        <section className={styles.metaList} aria-label="Thông tin công việc">
          <div className={styles.metaRow}><span className={styles.metaIcon}>♙</span><span className={styles.metaLabel}>Người thực hiện</span><strong>{assignee?.email || 'Chưa giao'}</strong></div>
          <div className={styles.metaRow}><span className={styles.metaIcon}>▣</span><span className={styles.metaLabel}>Hạn hoàn thành</span><strong>{formatDate(task.deadline)}{task.is_overdue ? ' · Quá hạn' : ''}</strong></div>
          <div className={styles.metaRow}><span className={styles.metaIcon}>☷</span><span className={styles.metaLabel}>Mô tả</span><strong className={task.description ? styles.descriptionValue : styles.mutedValue}>{task.description || 'Thêm mô tả cho công việc'}</strong></div>
        </section>

        <section className={styles.peopleRow}><span className={styles.metaIcon}>♧</span><div><span className={styles.metaLabel}>Người tham gia</span><div className={styles.people}>{participants.map(item => { const member = members.find(option => option.id === item.user_id); return <span className={styles.personChip} key={item.id} title={member?.email || item.user_id}>{initials(member?.email || item.user_id)}</span>; })}{participants.length === 0 && <small className={styles.mutedValue}>Chưa có người tham gia</small>}</div></div></section>

        <TaskChildren parentId={task.id} />

        <section className={styles.subtaskActionSection}>
          <button className={styles.addRow} type="button" disabled={!canCreateSubtask} aria-expanded={subtaskOpen} onClick={() => { setSubtaskError(''); setSubtaskOpen(value => !value); }}><span>＋</span> Tạo sub-task</button>
          {!canCreateSubtask && <p className={styles.inlineHint}>Chỉ người tham gia trực tiếp task cha mới có thể tạo sub-task.</p>}
          {subtaskOpen && <TaskAssignmentDrawer currentUserId={currentUserId ?? ''} members={members} parentTask={{ id: task.id, title: task.title }} submitting={creatingSubtask} error={subtaskError} onSubmit={createSubtask} onClose={() => setSubtaskOpen(false)} />}
        </section>

        <TaskDocuments task={task} canUpload={isParticipant} />

        <section className={styles.workflowSection} aria-labelledby="workflow-title">
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Bước tiếp theo</p><h2 id="workflow-title">Xử lý công việc</h2></div><span className={styles.mutedValue}>{nextStep}</span></div>
          {(canSubmit || canReview) ? <div className={styles.workflowGrid}>
            {canSubmit && <form className={styles.workflowForm} onSubmit={submit}><h3>Nộp kết quả</h3><p>Gửi nội dung hoàn thành để người review xử lý.</p><label>Kết quả<textarea name="content" required placeholder="Mô tả kết quả hoàn thành…" /></label><button type="submit" disabled={pendingAction}>Nộp để phê duyệt</button></form>}
            {canReview && <form className={styles.workflowForm} onSubmit={review}><h3>Phê duyệt submission</h3><p>Chọn submission đang chờ xử lý.</p><label>Submission<SearchableSelect name="submission_id" required defaultValue=""><option value="" disabled>Chọn submission</option>{submissions.filter(item => item.status === 'PENDING').map(item => <option key={item.id} value={item.id}>{formatDateTime(item.created_at)} · {item.status}</option>)}</SearchableSelect></label>{submissions.filter(item => item.status === 'PENDING').length === 0 && <small className={styles.inlineHint}>Chưa có submission đang chờ.</small>}<label>Quyết định<SearchableSelect name="decision" defaultValue="APPROVED"><option value="APPROVED">Phê duyệt</option><option value="NEED_REVISION">Yêu cầu chỉnh sửa</option><option value="REJECTED">Từ chối</option></SearchableSelect></label><label>Nhận xét <span>Tùy chọn</span><input name="comment" placeholder="Ghi chú cho người thực hiện" /></label><button type="submit" disabled={pendingAction || submissions.filter(item => item.status === 'PENDING').length === 0}>Ghi nhận quyết định</button></form>}
          </div> : <p className={styles.workflowHint}>{finalState ? 'Workflow đã hoàn tất.' : nextStep}</p>}
          {submissions.length > 0 && <div className={styles.submissionList}><strong>Lịch sử submission</strong>{submissions.slice(0, 3).map(item => <div className={styles.submissionItem} key={item.id}><span>{formatDateTime(item.created_at)}</span><b>{item.status}</b><small>{item.content}</small></div>)}</div>}
        </section>

        <section className={styles.activitySection} aria-labelledby="task-activity-title">
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Dòng thời gian</p><h2 id="task-activity-title">Hoạt động</h2></div><span className={styles.mutedValue}>{activity.length} cập nhật</span></div>
          <div className={styles.timeline}>{activity.length === 0 ? <p className={styles.emptyText}>Chưa có hoạt động.</p> : activity.map(item => <article key={item.id}><span className={styles.timelineAvatar}>{initials(memberName(item.actor_id))}</span><div><strong>{item.summary}</strong><small>{item.activity_type} · {memberName(item.actor_id)}</small><time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time></div></article>)}</div>
        </section>

        <section className={styles.commentsSection} aria-labelledby="comments-summary-title"><div><p className={styles.eyebrow}>Trao đổi chính thức</p><h2 id="comments-summary-title">Bình luận</h2><p>{comments.length === 0 ? 'Chưa có trao đổi trong task.' : `${comments.length} bình luận đang được lưu theo task.`}</p></div><Link className={styles.commentLink} href={`/tasks/${task.id}/comments`}>Mở bình luận <span>→</span></Link></section>

        <details className={styles.secondaryDetails}>
          <summary>Thông tin &amp; thao tác khác</summary>
          <div className={styles.detailsBody}>
            <div className={styles.detailBlock}><span className={styles.metaLabel}>Người thực hiện</span><form className={!isCreator ? styles.hidden : undefined} onSubmit={assign}><SearchableSelect name="assignee_id" aria-label="Chọn người thực hiện" defaultValue={task.assignee_id ?? ''} required><option value="">Chọn nhân viên</option>{assignableMembers.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</SearchableSelect><button type="submit" disabled={pendingAction}>Cập nhật</button></form></div>
            <div className={styles.detailBlock}><span className={styles.metaLabel}>Thêm người tham gia</span><form className={`${styles.participantForm} ${!isCreator ? styles.hidden : ''}`} onSubmit={participant}><SearchableSelect name="user_id" aria-label="Thêm người tham gia" required defaultValue=""><option value="" disabled>Chọn nhân viên</option>{members.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</SearchableSelect><input name="role" placeholder="Vai trò (tùy chọn)" /><button type="submit" disabled={pendingAction}>Thêm</button></form></div>
            <div className={styles.secondaryActions}>{canCancelTask && <button type="button" disabled={pendingAction} onClick={() => { if (window.confirm('Hủy công việc này?')) void act(() => tasksApi.status(task.id, 'CANCELLED'), 'Đã hủy công việc.', 'Không thể hủy công việc.'); }}>Hủy công việc</button>}{canModifyTask && <button type="button" className={styles.dangerAction} disabled={pendingAction} onClick={() => { const reason = window.prompt('Lý do công việc bị chặn?'); if (reason) void act(() => tasksApi.block(task.id, reason), 'Đã đánh dấu bị chặn.', 'Không thể chặn công việc.'); }}>{task.blocked ? 'Cập nhật lý do chặn' : 'Báo cáo lỗi / Chặn'}</button>}{canModifyTask && task.blocked && <button type="button" disabled={pendingAction} onClick={() => void act(() => tasksApi.unblock(task.id), 'Đã bỏ chặn.', 'Không thể bỏ chặn.')}>Bỏ chặn</button>}</div>
          </div>
        </details>
      </main>
    </div>
  </section>;
}
