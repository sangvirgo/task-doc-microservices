'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useState } from 'react';
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
const statusLabel = (value: string) => value.replaceAll('_', ' ');
const initials = (value: string) => value.split(/[@ ._-]/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U';

export function TaskDetail({ id }: { id: string }) {
  const [task, setTask] = useState<Task | AncestorTaskSummary | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
  const [error, setError] = useState<number>();
  const load = () => { setError(undefined); setTask(null); tasksApi.get(id).then(async result => { setTask(result); if (!isSummary(result)) { const [participantItems, activityItems, commentItems] = await Promise.all([tasksApi.participants(id), tasksApi.activity(id), tasksApi.comments(id)]); setParticipants(participantItems); setActivity(activityItems); setComments(commentItems); if (tasksApi.submissions) tasksApi.submissions(id).then(setSubmissions).catch(() => setSubmissions([])); } }).catch((reason: unknown) => setError(reason instanceof GatewayError ? reason.status : 503)); };
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
  if (isSummary(task)) return <section className={styles.summaryOnly}><h1>{task.title}</h1><p><strong>Ancestor oversight: summary only.</strong> Chỉ hiển thị tổng quan công việc tổ tiên. Bình luận, hoạt động, người tham gia và tài liệu không khả dụng.</p><dl><dt>Trạng thái</dt><dd>{task.status}</dd><dt>Người được giao</dt><dd>{task.assignee ?? 'Chưa giao'}</dd><dt>Deadline</dt><dd>{task.deadline ?? '—'}</dd><dt>Quá hạn</dt><dd>{task.is_overdue ? 'Có' : 'Không'}</dd><dt>Kết quả</dt><dd>{task.completion_result ?? '—'}</dd></dl></section>;
  return <DirectTask task={task} comments={comments} activity={activity} participants={participants} submissions={submissions} members={members} reload={load} />;
}

function DirectTask({ task, comments, activity, participants, submissions, members, reload }: { task: Task; comments: TaskComment[]; activity: Activity[]; participants: Participant[]; submissions: TaskSubmission[]; members: MemberOption[]; reload: () => void }) {
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'activity' | 'comments' | 'review'>('activity');
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [creatingSubtask, setCreatingSubtask] = useState(false);
  const [subtaskError, setSubtaskError] = useState('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');
  useEffect(() => { if (!selectedSubmissionId && submissions[0]) setSelectedSubmissionId(submissions[0].id); }, [selectedSubmissionId, submissions]);
  const selectedSubmission = submissions.find(item => item.id === selectedSubmissionId) ?? submissions[0];
  const act = async (work: () => Promise<unknown>, success: string, fallback: string) => { try { await work(); setNotice(success); reload(); } catch (error) { setNotice(message(error, fallback)); } };
  const comment = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const content = String(new FormData(form).get('content')); void act(() => tasksApi.comment(task.id, content), 'Đã đăng bình luận.', 'Không thể đăng bình luận.'); form.reset(); };
  const assign = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const assigneeId = String(new FormData(event.currentTarget).get('assignee_id')); void act(() => tasksApi.assign(task.id, assigneeId), 'Đã cập nhật người được giao.', 'Không thể cập nhật người được giao.'); };
  const participant = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void act(() => tasksApi.addParticipant(task.id, String(data.get('user_id')), String(data.get('role')) || undefined), 'Đã thêm người tham gia.', 'Không thể thêm người tham gia.'); form.reset(); };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const content = String(new FormData(event.currentTarget).get('content')); void act(() => tasksApi.submit(task.id, content), 'Đã nộp kết quả để duyệt.', 'Không thể nộp kết quả.'); };
  const review = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act(() => tasksApi.review(task.id, String(data.get('submission_id')), String(data.get('decision')) as 'APPROVED' | 'NEED_REVISION' | 'REJECTED', String(data.get('comment')) || undefined), 'Đã ghi nhận phê duyệt.', 'Không thể ghi nhận phê duyệt.'); };
  const createSubtask = async (input: CreateTaskInput) => {
    setSubtaskError('');
    setCreatingSubtask(true);
    try {
      await tasksApi.create({ ...input, parent_task_id: task.id });
      setSubtaskOpen(false);
      setNotice('Đã tạo sub-task trong công việc này.');
    } catch {
      setSubtaskError('Không thể tạo sub-task. Kiểm tra thông tin và thử lại.');
    } finally {
      setCreatingSubtask(false);
    }
  };
  const assignee = members.find(member => member.id === task.assignee_id);
  const currentUserId = readSession()?.userId;
  const isCreator = currentUserId === task.creator_id;
  const isAssignee = currentUserId === task.assignee_id;
  const canReview = currentUserId === (task.reviewer_id ?? task.creator_id);
  const canSubmit = isAssignee;
  const assignableMembers = currentUserId ? members.filter(member => member.id !== currentUserId) : members;
  const finalState = ['APPROVED', 'REJECTED', 'CANCELLED'].includes(task.status);
  const canCreateSubtask = isAssignee && !finalState;
  const canCancelTask = !finalState && !isAssignee;

  return <section className={styles.page}>
    <div className={styles.breadcrumb}><span>Công việc</span><b>›</b><span>{task.id.slice(0, 8)}</span></div>
    <div className={styles.layout}>
      <div className={styles.mainColumn}>
        <header className={styles.taskHeader}><h1>{task.title}</h1><p>{task.description || 'Chưa có mô tả cho công việc này.'}</p></header>
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        <section className={styles.overviewCard}><h2>Tổng quan tiến độ</h2><div><article><span>Trạng thái</span><strong>{statusLabel(task.status)}</strong></article><article><span>Tiến độ</span><strong>{task.blocked ? 'Đang bị chặn' : task.is_overdue ? 'Quá hạn' : 'Đúng tiến độ'}</strong></article><article><span>Cập nhật</span><strong>{new Date(task.updated_at).toLocaleDateString('vi-VN')}</strong></article></div></section>
        <TaskDocuments task={task} />
        <TaskChildren parentId={task.id} />
        <section className={styles.collaboration}>
          <div className={styles.tabs} role="tablist" aria-label="Nội dung công việc"><button className={tab === 'activity' ? styles.activeTab : ''} onClick={() => setTab('activity')} role="tab" aria-selected={tab === 'activity'}>Hoạt động <span>{activity.length}</span></button><button className={tab === 'comments' ? styles.activeTab : ''} onClick={() => setTab('comments')} role="tab" aria-selected={tab === 'comments'}>Bình luận <span>{comments.length}</span></button><button className={`${tab === 'review' ? styles.activeTab : ''} ${!canSubmit && !canReview ? styles.hidden : ''}`} onClick={() => setTab('review')} role="tab" aria-selected={tab === 'review'}>{canSubmit && canReview ? 'Nộp & phê duyệt' : canSubmit ? 'Nộp kết quả' : 'Phê duyệt'}</button></div>
          {tab === 'activity' && <div className={styles.timeline}>{activity.length === 0 ? <p className={styles.emptyText}>Chưa có hoạt động.</p> : activity.map(item => <article key={item.id}><span className={styles.timelineAvatar}>HT</span><div><div><strong>{item.summary}</strong><time>{new Date(item.created_at).toLocaleString('vi-VN')}</time></div><small>{item.activity_type}</small></div></article>)}</div>}
          {tab === 'comments' && <div className={styles.comments}>{comments.map(item => <article key={item.id}><span className={styles.commentAvatar}>NV</span><div><p>{item.content}</p><time>{new Date(item.created_at).toLocaleString('vi-VN')}</time></div></article>)}<form onSubmit={comment}><label htmlFor="comment">Thêm bình luận</label><textarea id="comment" name="content" required placeholder="Viết bình luận hoặc phản hồi…" /><div><button>Gửi bình luận</button></div></form></div>}
          {tab === 'review' && <div className={styles.reviewGrid}><form className={`${styles.focusCard} ${!canSubmit ? styles.hidden : ""}`} onSubmit={submit}><h3>Nộp kết quả</h3><p>Gửi kết quả công việc để người phụ trách phê duyệt.</p><label>Kết quả<textarea name="content" required /></label><button>Nộp để duyệt</button></form><form className={`${styles.focusCard} ${!canReview ? styles.hidden : ""}`} onSubmit={review}><h3>Phê duyệt</h3><label>Submission<SearchableSelect name="submission_id" required value={selectedSubmissionId} onChange={event => setSelectedSubmissionId(event.target.value)}><option value="" disabled>Choose a submission</option>{submissions.map(item => <option key={item.id} value={item.id}>{new Date(item.created_at).toLocaleString("vi-VN")} · {item.status}</option>)}</SearchableSelect></label>{selectedSubmission && <div className={styles.submissionPreview}><strong>Nội dung bài nộp</strong><p>{selectedSubmission.content}</p></div>}{submissions.length === 0 && <small className={styles.inlineHint}>No submissions available.</small>}<label>Quyết định<SearchableSelect name="decision"><option>APPROVED</option><option>NEED_REVISION</option><option>REJECTED</option></SearchableSelect></label><label>Nhận xét <span>Tùy chọn</span><input name="comment" /></label><button>Ghi nhận</button></form></div>}
        </section>
      </div>

      <aside className={styles.sideRail}>
        <section className={styles.railCard}>
          <div className={styles.railStatus}><span>Trạng thái</span><strong className={`${styles.statusBadge} ${styles[task.status.toLowerCase()]}`}>{task.blocked ? 'BLOCKED' : statusLabel(task.status)}</strong></div>
          {isAssignee && (task.status === 'ASSIGNED' || task.status === 'NEED_REVISION') && <button className={styles.startButton} onClick={() => void act(() => tasksApi.status(task.id, 'IN_PROGRESS'), 'Đã bắt đầu công việc.', 'Không thể bắt đầu công việc.')}>Bắt đầu làm</button>}
          <button className={styles.subtaskButton} type="button" disabled={!canCreateSubtask} aria-expanded={subtaskOpen} onClick={() => { setSubtaskError(''); setSubtaskOpen(value => !value); }}>＋ Tạo sub-task</button>
          {!canCreateSubtask && <p className={styles.inlineHint}>Chỉ người được giao task cha mới có thể tạo sub-task.</p>}
          {subtaskOpen && <TaskAssignmentDrawer currentUserId={currentUserId ?? ''} members={members} parentTask={{ id: task.id, title: task.title }} submitting={creatingSubtask} error={subtaskError} onSubmit={createSubtask} onClose={() => setSubtaskOpen(false)} />}
          <div className={styles.railBody}>
            <div className={styles.metaBlock}><span>Người thực hiện</span><div className={styles.person}><i>{initials(assignee?.email || 'U')}</i><strong>{assignee?.email || 'Chưa giao'}</strong></div><form className={!isCreator ? styles.hidden : undefined} onSubmit={assign}><SearchableSelect name="assignee_id" aria-label="Chọn người thực hiện" defaultValue={task.assignee_id ?? ''} required><option value="">Chọn nhân viên</option>{assignableMembers.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</SearchableSelect><button>Cập nhật</button></form></div>
            <div className={styles.metaBlock}><span>Hạn hoàn thành</span><strong>◷ {task.deadline ? new Date(task.deadline).toLocaleString('vi-VN') : 'Chưa đặt'}</strong></div>
            <div className={styles.metaBlock}><span>Người liên quan</span><div className={styles.participantChips}>{participants.map(item => { const member = members.find(option => option.id === item.user_id); return <span key={item.id} title={member?.email || item.user_id}>{initials(member?.email || item.user_id)}</span>; })}{participants.length === 0 && <small>Chưa có người tham gia</small>}</div><form className={`${styles.participantForm} ${!isCreator ? styles.hidden : ""}`} onSubmit={participant}><SearchableSelect name="user_id" aria-label="Thêm người tham gia" required defaultValue=""><option value="" disabled>Thêm người tham gia</option>{members.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</SearchableSelect><input name="role" placeholder="Vai trò (tùy chọn)" /><button>+ Thêm</button></form></div>
          </div>
          <footer className={styles.railActions}>{canCancelTask && <button onClick={() => { if (confirm('Hủy công việc này?')) void act(() => tasksApi.status(task.id, 'CANCELLED'), 'Đã hủy công việc.', 'Không thể hủy công việc.'); }}>Hủy nhiệm vụ</button>}<button className={styles.dangerAction} onClick={() => { const reason = prompt('Lý do công việc bị chặn?'); if (reason) void act(() => tasksApi.block(task.id, reason), 'Đã đánh dấu bị chặn.', 'Không thể chặn công việc.'); }}>{task.blocked ? 'Cập nhật lý do chặn' : 'Báo cáo lỗi / Chặn'}</button>{task.blocked && <button onClick={() => void act(() => tasksApi.unblock(task.id), 'Đã bỏ chặn.', 'Không thể bỏ chặn.')}>Bỏ chặn</button>}</footer>
        </section>
        <p className={styles.taskId}>ID: {task.id} · Tạo {new Date(task.created_at).toLocaleDateString('vi-VN')}</p>
      </aside>
    </div>
  </section>;
}
