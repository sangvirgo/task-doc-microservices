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
import { TaskPeople } from './task-people';
import { TaskCollaboration } from './task-collaboration';
import type { AncestorTaskSummary, CreateTaskInput, Participant, Task, TaskSubmission } from '@/types/task';
import styles from './task-detail.module.css';
import { SearchableSelect } from '@/components/searchable-select';
import { TaskAssignmentDrawer } from './task-assignment-drawer';
import { taskStatusClass, taskStatusLabel } from './task-status';
import { uploadTaskAttachments } from './task-document-upload';
import { TaskProgress } from './task-progress';

const isSummary = (value: Task | AncestorTaskSummary): value is AncestorTaskSummary => !('id' in value);
const message = (error: unknown, fallback: string) => error instanceof GatewayError && error.status === 409 ? 'Công việc đã thay đổi. Tải lại và thử lại.' : fallback;
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Chưa đặt';
const formatDateTime = (value: string) => new Date(value).toLocaleString('vi-VN');
const toLocalInput = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function TaskDetail({ id }: { id: string }) {
  const [task, setTask] = useState<Task | AncestorTaskSummary | null>(null);
  const [parentContext, setParentContext] = useState<Task | AncestorTaskSummary | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
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

      const [participantResult] = await Promise.allSettled([tasksApi.participants(id)]);
      if (!isCurrent()) return;
      if (participantResult.status === 'fulfilled') setParticipants(participantResult.value);
      if (tasksApi.submissions) tasksApi.submissions(id).then(submissionItems => { if (isCurrent()) setSubmissions(submissionItems); }).catch(() => { if (isCurrent()) setSubmissions([]); });
    }).catch((reason: unknown) => { if (isCurrent()) setError(reason instanceof GatewayError ? reason.status : 503); });
  };
  useEffect(load, [id]);

  useEffect(() => {
    let cancelled = false;
    adminApi.directory().then(items => { if (!cancelled) setMembers(items); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (error === 403) return <PermissionDeniedState />;
  if (error) return <ErrorState message="Không thể tải chi tiết công việc." onRetry={load} />;
  if (!task) return <LoadingState />;
  if (isSummary(task)) return <AncestorSummary task={task} />;
  return <DirectTask task={task} parentContext={parentContext} participants={participants} submissions={submissions} members={members} reload={load} />;
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

function DirectTask({ task, parentContext, participants, submissions, members, reload }: { task: Task; parentContext: Task | AncestorTaskSummary | null; participants: Participant[]; submissions: TaskSubmission[]; members: MemberOption[]; reload: () => void }) {
  const [notice, setNotice] = useState('');
  const [pendingAction, setPendingAction] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [blockFormOpen, setBlockFormOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [blockValidation, setBlockValidation] = useState('');
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editValidation, setEditValidation] = useState('');
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [creatingSubtask, setCreatingSubtask] = useState(false);
  const [subtaskError, setSubtaskError] = useState('');
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const act = async (work: () => Promise<unknown>, success: string, fallback: string, onSuccess?: () => void) => {
    if (pendingAction) return;
    setPendingAction(true);
    try { await work(); onSuccess?.(); setNotice(success); reload(); } catch (error) { setNotice(message(error, fallback)); } finally { setPendingAction(false); }
  };
  const assign = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const assigneeId = String(new FormData(event.currentTarget).get('assignee_id')); void act(() => tasksApi.assign(task.id, assigneeId), 'Đã cập nhật người được giao.', 'Không thể cập nhật người được giao.'); };
  const participant = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void act(() => tasksApi.addParticipant(task.id, String(data.get('user_id')), String(data.get('role')) || undefined), 'Đã thêm người tham gia.', 'Không thể thêm người tham gia.'); form.reset(); };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const content = String(new FormData(event.currentTarget).get('content')); void act(() => tasksApi.submit(task.id, content), 'Đã nộp kết quả để duyệt.', 'Không thể nộp kết quả.'); };
  const review = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act(() => tasksApi.review(task.id, String(data.get('submission_id')), String(data.get('decision')) as 'APPROVED' | 'NEED_REVISION' | 'REJECTED', String(data.get('comment')) || undefined), 'Đã ghi nhận phê duyệt.', 'Không thể ghi nhận phê duyệt.'); };
  const cancelTask = () => { if (window.confirm('Hủy công việc này?')) void act(() => tasksApi.status(task.id, 'CANCELLED'), 'Đã hủy công việc.', 'Không thể hủy công việc.'); };
  const submitBlock = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = blockReason.trim();
    if (!reason) { setBlockValidation('Hãy nhập lý do trước khi chặn công việc.'); return; }
    void act(
      () => tasksApi.block(task.id, reason),
      'Đã đánh dấu công việc bị chặn.',
      'Không thể chặn công việc.',
      () => { setBlockFormOpen(false); setBlockReason(''); setBlockValidation(''); },
    );
  };
  const createSubtask = async (input: CreateTaskInput, form: HTMLFormElement) => {
    setSubtaskError('');
    setCreatingSubtask(true);
    try {
      const created = await tasksApi.create({ ...input, parent_task_id: task.id });
      const attachments = await uploadTaskAttachments(form, created, currentUserId ?? '');
      setSubtaskOpen(false);
      setNotice(attachments.skipped ? 'Đã tạo sub-task, nhưng ' + attachments.skipped + ' tệp chưa thể tải lên' + (attachments.error ? ' (' + attachments.error + ').' : '.') : 'Đã tạo sub-task trong công việc này.');
      reload();
    } catch { setSubtaskError('Không thể tạo sub-task. Kiểm tra thông tin và thử lại.'); } finally { setCreatingSubtask(false); }
  };
  const openEdit = () => {
    setEditTitle(task.title);
    setEditDescription(task.description ?? '');
    setEditDeadline(toLocalInput(task.deadline));
    setEditValidation('');
    setEditFormOpen(true);
    setActionMenuOpen(false);
  };
  const submitEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = editTitle.trim();
    if (!title) { setEditValidation('Tiêu đề không được bỏ trống.'); return; }
    void act(
      () => tasksApi.update(task.id, {
        title,
        ...(editDescription.trim() ? { description: editDescription.trim() } : { description: null }),
        ...(editDeadline ? { deadline: new Date(editDeadline).toISOString() } : { deadline: null }),
      }),
      'Đã cập nhật thông tin công việc.',
      'Không thể cập nhật thông tin công việc.',
      () => { setEditFormOpen(false); setEditTitle(''); setEditDescription(''); setEditDeadline(''); setEditValidation(''); },
    );
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
  const hasTaskActions = (canModifyTask && (!finalState || task.blocked)) || canCancelTask;
  const nextStep = task.blocked ? 'Cần bỏ chặn trước khi tiếp tục.' : task.status === 'ASSIGNED' ? 'Người thực hiện có thể bắt đầu công việc.' : task.status === 'IN_PROGRESS' ? 'Hoàn tất nội dung rồi nộp để phê duyệt.' : task.status === 'WAITING_REVIEW' ? 'Người review cần xử lý submission mới nhất.' : task.status === 'NEED_REVISION' ? 'Cần chỉnh sửa rồi bắt đầu lại.' : finalState ? 'Công việc đã kết thúc.' : 'Theo dõi tiến độ và phối hợp cùng người tham gia.';
  const parentTitle = parentContext?.title ?? (task.parent_task_id ? `Task ${task.parent_task_id.slice(0, 8)}` : null);
  const parentHref = parentContext && !isSummary(parentContext) ? `/tasks/${parentContext.id}` : undefined;

  useEffect(() => {
    if (!actionMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!actionMenuRef.current?.contains(event.target as Node)) setActionMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOnOutsidePointer); document.removeEventListener('keydown', closeOnEscape); };
  }, [actionMenuOpen]);

  useEffect(() => {
    if (!blockFormOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setBlockFormOpen(false);
      setBlockReason('');
      setBlockValidation('');
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [blockFormOpen]);

  useEffect(() => {
    if (!editFormOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setEditFormOpen(false);
      setEditValidation('');
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [editFormOpen]);

  return <section className={styles.page}>
    <div className={styles.drawer}>
      <header className={styles.topBar}>
        <Link className={styles.closeButton} href="/tasks" aria-label="Quay lại danh sách công việc">×</Link>
        <span className={styles.topBarTitle}>Chi tiết công việc</span>
        <div className={styles.topActions}>
          {isAssignee && (task.status === 'ASSIGNED' || task.status === 'NEED_REVISION') && <button className={styles.topAction} type="button" disabled={pendingAction} onClick={() => void act(() => tasksApi.status(task.id, 'IN_PROGRESS'), 'Đã bắt đầu công việc.', 'Không thể bắt đầu công việc.')}>Bắt đầu</button>}
        </div>
      </header>

      <main className={styles.content}>
        <nav className={styles.breadcrumb} aria-label="Đường dẫn công việc">
          <Link href="/tasks">Công việc</Link><span>›</span>
          {parentTitle ? <>{parentHref ? <Link href={parentHref}>{parentTitle}</Link> : <span>{parentTitle}</span>}<span>›</span></> : null}
          <span className={styles.currentCrumb}>{task.title}</span>
        </nav>

        <header className={styles.taskHeader}>
          <div className={styles.titleRow}><h1>{task.title}</h1><div className={styles.titleControls}><span className={`${styles.statusBadge} ${styles[taskStatusClass(task.status)]}`}>{task.blocked ? 'Bị chặn' : taskStatusLabel(task.status)}</span>{hasTaskActions && <div className={styles.actionMenuWrap} ref={actionMenuRef}><button className={styles.actionMenuButton} type="button" aria-label="Thao tác" aria-haspopup="menu" aria-expanded={actionMenuOpen} aria-controls={`task-actions-${task.id}`} onClick={() => setActionMenuOpen(open => !open)}><span aria-hidden="true">⋯</span><span>Thao tác</span></button>{actionMenuOpen && <div id={`task-actions-${task.id}`} className={styles.actionMenu} role="menu" aria-label="Thao tác với công việc">{isCreator && <button type="button" role="menuitem" onClick={openEdit}><span aria-hidden="true">✎</span> Chỉnh sửa thông tin</button>}{canModifyTask && !task.blocked && !finalState && <button type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); setBlockValidation(''); setBlockFormOpen(true); }}><span aria-hidden="true">⚠</span> Báo cáo vấn đề / Chặn công việc</button>}{canModifyTask && task.blocked && <button type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); void act(() => tasksApi.unblock(task.id), 'Đã bỏ chặn công việc.', 'Không thể bỏ chặn công việc.'); }}><span aria-hidden="true">✓</span> Bỏ chặn công việc</button>}{canCancelTask && !task.blocked && <button type="button" role="menuitem" onClick={cancelTask}><span aria-hidden="true">×</span> Hủy công việc</button>}</div>}</div>}</div></div>
          <p className={styles.taskId}>ID: {task.id}</p>
        </header>
        <TaskProgress
          status={task.status}
          completion_percentage={task.completion_percentage}
          child_task_count={task.child_task_count}
          approved_child_task_count={task.approved_child_task_count}
          completion_color={task.completion_color}
        />
        {notice && <p className={styles.notice} role="status">{notice}</p>}

        <div className={styles.detailGrid}>
          <div className={styles.mainColumn}>
            <section className={styles.metaList} aria-label="Thông tin công việc">
              <div className={styles.metaRow}><span className={styles.metaIcon}>♙</span><span className={styles.metaLabel}>Người thực hiện</span>{isCreator ? <form className={styles.detailBlock} aria-label="Cập nhật người thực hiện" onSubmit={assign}><SearchableSelect name="assignee_id" aria-label="Chọn người thực hiện" defaultValue={task.assignee_id ?? ''} required><option value="">Chọn nhân viên</option>{assignableMembers.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</SearchableSelect><button type="submit" disabled={pendingAction}>Cập nhật</button></form> : <strong>{assignee?.email || 'Chưa giao'}</strong>}</div>
              <div className={styles.metaRow}><span className={styles.metaIcon}>▣</span><span className={styles.metaLabel}>Hạn hoàn thành</span><strong>{formatDate(task.deadline)}{task.is_overdue ? ' · Quá hạn' : ''}</strong></div>
              <div className={styles.metaRow}><span className={styles.metaIcon}>☷</span><span className={styles.metaLabel}>Mô tả</span><strong className={task.description ? styles.descriptionValue : styles.mutedValue}>{task.description || 'Thêm mô tả cho công việc'}</strong></div>
            </section>
            <TaskChildren
              parentId={task.id}
              initialChildren={task.children}
              createAction={<div>
                <button className={styles.addRow} type="button" disabled={!canCreateSubtask} aria-expanded={subtaskOpen} onClick={() => { setSubtaskError(''); setSubtaskOpen(value => !value); }}><span>＋</span> Tạo sub-task</button>
                {!canCreateSubtask && <p className={styles.inlineHint}>Chỉ người tham gia trực tiếp task cha mới có thể tạo sub-task.</p>}
                {subtaskOpen && <TaskAssignmentDrawer currentUserId={currentUserId ?? ''} members={members} parentTask={{ id: task.id, title: task.title }} submitting={creatingSubtask} error={subtaskError} onSubmit={createSubtask} onClose={() => setSubtaskOpen(false)} />}
              </div>}
            />
            <TaskPeople task={task} participants={participants} members={members} canManageParticipants={isCreator} addingParticipant={pendingAction} onAddParticipant={participant} />
            <TaskDocuments task={task} canUpload={isParticipant} members={members} participants={participants} childTasks={task.children} />
            <section className={styles.workflowSection} aria-labelledby="workflow-title">
              <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Bước tiếp theo</p><h2 id="workflow-title">Xử lý công việc</h2></div><span className={styles.mutedValue}>{nextStep}</span></div>
              {(canSubmit || canReview) ? <div className={styles.workflowGrid}>
                {canSubmit && <form className={styles.workflowForm} onSubmit={submit}><h3>Nộp kết quả</h3><p>Gửi nội dung hoàn thành để người review xử lý.</p><label>Kết quả<textarea name="content" required placeholder="Mô tả kết quả hoàn thành…" /></label><button type="submit" disabled={pendingAction}>Nộp để phê duyệt</button></form>}
                {canReview && <form className={styles.workflowForm} onSubmit={review}><h3>Phê duyệt submission</h3><p>Chọn submission đang chờ xử lý.</p><label>Submission<SearchableSelect name="submission_id" required defaultValue=""><option value="" disabled>Chọn submission</option>{submissions.filter(item => item.status === 'PENDING').map(item => <option key={item.id} value={item.id}>{formatDateTime(item.created_at)} · {item.status}</option>)}</SearchableSelect></label>{submissions.filter(item => item.status === 'PENDING').length === 0 && <small className={styles.inlineHint}>Chưa có submission đang chờ.</small>}<label>Quyết định<SearchableSelect name="decision" defaultValue="APPROVED"><option value="APPROVED">Phê duyệt</option><option value="NEED_REVISION">Yêu cầu chỉnh sửa</option><option value="REJECTED">Từ chối</option></SearchableSelect></label><label>Nhận xét <span>Tùy chọn</span><input name="comment" placeholder="Ghi chú cho người thực hiện" /></label><button type="submit" disabled={pendingAction || submissions.filter(item => item.status === 'PENDING').length === 0}>Ghi nhận quyết định</button></form>}
              </div> : <p className={styles.workflowHint}>{finalState ? 'Workflow đã hoàn tất.' : nextStep}</p>}
              {submissions.length > 0 && <div className={styles.submissionList}><strong>Lịch sử submission</strong>{submissions.slice(0, 3).map(item => <div className={styles.submissionItem} key={item.id}><span>{formatDateTime(item.created_at)}</span><b>{item.status}</b><small>{item.content}</small></div>)}</div>}
            </section>
            <TaskCollaboration taskId={task.id} members={members} />
          </div>
        </div>

        {blockFormOpen && <div className={styles.blockDialog} role="dialog" aria-modal="true" aria-labelledby={`block-title-${task.id}`} aria-describedby={`block-description-${task.id}`}><form onSubmit={submitBlock}><div className={styles.blockDialogHeader}><div><p className={styles.eyebrow}>Cần thông báo cho mọi người</p><h2 id={`block-title-${task.id}`}>Báo cáo vấn đề / Chặn công việc</h2></div><button type="button" className={styles.dialogClose} aria-label="Đóng biểu mẫu chặn công việc" onClick={() => { setBlockFormOpen(false); setBlockReason(''); setBlockValidation(''); }}>×</button></div><p id={`block-description-${task.id}`}>Công việc sẽ tạm dừng. Hãy ghi rõ lý do để người liên quan biết cần xử lý gì.</p><label htmlFor={`block-reason-${task.id}`}>Lý do</label><textarea id={`block-reason-${task.id}`} value={blockReason} onChange={event => { setBlockReason(event.target.value); setBlockValidation(''); }} placeholder="Ví dụ: Chưa nhận được tài liệu từ khách hàng" aria-invalid={Boolean(blockValidation)} aria-describedby={blockValidation ? `block-validation-${task.id}` : undefined} /><span className={styles.blockHint}>Bắt buộc nhập lý do.</span>{blockValidation && <p id={`block-validation-${task.id}`} className={styles.blockValidation} role="alert">{blockValidation}</p>}<div className={styles.blockDialogActions}><button type="button" className={styles.secondaryButton} onClick={() => { setBlockFormOpen(false); setBlockReason(''); setBlockValidation(''); }}>Hủy</button><button type="submit" className={styles.dangerButton} disabled={pendingAction}>Xác nhận chặn công việc</button></div></form></div>}

        {editFormOpen && <div className={styles.editDialog} role="dialog" aria-modal="true" aria-labelledby={`edit-title-${task.id}`}><form onSubmit={submitEdit}><div className={styles.editDialogHeader}><div><p className={styles.eyebrow}>Chỉ người tạo task được sửa</p><h2 id={`edit-title-${task.id}`}>Chỉnh sửa thông tin công việc</h2></div><button type="button" className={styles.dialogClose} aria-label="Đóng biểu mẫu chỉnh sửa" onClick={() => { setEditFormOpen(false); setEditValidation(''); }}>×</button></div><label htmlFor={`edit-task-title-${task.id}`}>Tiêu đề</label><input id={`edit-task-title-${task.id}`} value={editTitle} onChange={event => { setEditTitle(event.target.value); setEditValidation(''); }} aria-invalid={Boolean(editValidation)} aria-describedby={editValidation ? `edit-validation-${task.id}` : undefined} /><label htmlFor={`edit-task-description-${task.id}`}>Mô tả <span className={styles.optionalLabel}>Tùy chọn</span></label><textarea id={`edit-task-description-${task.id}`} value={editDescription} onChange={event => setEditDescription(event.target.value)} rows={4} placeholder="Bối cảnh, kết quả mong đợi, tiêu chí hoàn thành…" /><label htmlFor={`edit-task-deadline-${task.id}`}>Hạn hoàn thành <span className={styles.optionalLabel}>Bỏ trống để xóa hạn</span></label><input id={`edit-task-deadline-${task.id}`} type="datetime-local" value={editDeadline} onChange={event => setEditDeadline(event.target.value)} />{editValidation && <p id={`edit-validation-${task.id}`} className={styles.editValidation} role="alert">{editValidation}</p>}<div className={styles.editDialogActions}><button type="button" className={styles.secondaryButton} onClick={() => { setEditFormOpen(false); setEditValidation(''); }}>Hủy</button><button type="submit" className={styles.primaryButton} disabled={pendingAction}>{pendingAction ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div></form></div>}
      </main>
    </div>
  </section>;
}
