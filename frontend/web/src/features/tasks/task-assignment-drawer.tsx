'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { MemberOption } from '@/types/admin';
import type { CreateTaskInput } from '@/types/task';
import { SearchableSelect } from '@/components/searchable-select';
import styles from './task-assignment-drawer.module.css';

export interface TaskAssignmentDrawerProps {
  currentUserId: string;
  members: MemberOption[];
  parentTask?: { id: string; title: string };
  submitting?: boolean;
  error?: string;
  onSubmit: (input: CreateTaskInput, form: HTMLFormElement) => void | Promise<void>;
  onClose: () => void;
}

const uniqueMembers = (members: MemberOption[], currentUserId: string): MemberOption[] => {
  const byId = new Map(members.map(member => [member.id, member]));
  if (currentUserId && !byId.has(currentUserId)) byId.set(currentUserId, { id: currentUserId, email: 'Bạn' });
  return [...byId.values()];
};

export function TaskAssignmentDrawer({ currentUserId, members, parentTask, submitting = false, error, onSubmit, onClose }: TaskAssignmentDrawerProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [reviewerId, setReviewerId] = useState(currentUserId);
  const availableMembers = useMemo(() => uniqueMembers(members, currentUserId), [currentUserId, members]);
  const assignees = availableMembers.filter(member => member.id !== currentUserId);
  const conflict = Boolean(assigneeId && reviewerId && assigneeId === reviewerId);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (conflict) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const rawTitle = String(data.get('title') ?? '').trim();
    const rawDescription = String(data.get('description') ?? '').trim();
    const rawDeadline = String(data.get('deadline') ?? '');
    const input: CreateTaskInput = {
      title: rawTitle,
      ...(rawDescription ? { description: rawDescription } : {}),
      ...(assigneeId ? { assignee_id: assigneeId } : {}),
      ...(reviewerId ? { reviewer_id: reviewerId } : {}),
      ...(rawDeadline ? { deadline: new Date(rawDeadline).toISOString() } : {}),
    };
    void onSubmit(input, form);
  };

  return <div className={styles.backdrop} role="presentation" onMouseDown={event => { if (!submitting && event.target === event.currentTarget) onClose(); }}>
    <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="task-assignment-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{parentTask ? 'Tạo sub-task' : 'Tạo công việc mới'}</span>
          <h2 id="task-assignment-title">{parentTask ? 'Giao một phần việc' : 'Giao task đúng người'}</h2>
        </div>
        <button className={styles.closeButton} type="button" aria-label="Đóng" disabled={submitting} onClick={onClose}>×</button>
      </header>

      <form className={styles.form} onSubmit={submit}>
        {parentTask && <div className={styles.parentContext}><span>Task cha</span><strong>{parentTask.title}</strong></div>}

        <label htmlFor="task-title">Tiêu đề task<input ref={titleRef} id="task-title" name="title" required placeholder="Ví dụ: Rà soát báo cáo tháng 8" /></label>
        <label htmlFor="task-description">Mô tả <span>Tùy chọn</span><textarea id="task-description" name="description" rows={4} placeholder="Nêu rõ đầu ra, tiêu chí hoàn thành hoặc bối cảnh…" /></label>

        <div className={styles.fieldGrid}>
          <label>Người được giao <span>Tùy chọn</span><SearchableSelect name="assignee_id" aria-label="Người được giao" value={assigneeId} onChange={event => setAssigneeId(event.target.value)}>
            <option value="">Chưa giao</option>
            {assignees.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}
          </SearchableSelect></label>
          <label>Người review <strong>*</strong><SearchableSelect name="reviewer_id" aria-label="Người review" value={reviewerId} required onChange={event => setReviewerId(event.target.value)}>
            {availableMembers.map(member => <option key={member.id} value={member.id}>{member.id === currentUserId ? `${member.email} (bạn)` : member.email}</option>)}
          </SearchableSelect></label>
        </div>

        {conflict && <p className={styles.conflict} role="alert">Người được giao và người review phải là hai người khác nhau.</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}

        <label htmlFor="task-deadline">Hạn hoàn thành <span>Tùy chọn</span><input id="task-deadline" name="deadline" type="datetime-local" /></label>
        <p className={styles.helper}>{assigneeId ? 'Task sẽ được chuyển sang trạng thái Đã giao.' : 'Chưa giao người thực hiện thì task được lưu ở trạng thái Chưa giao; bạn có thể giao sau.'}</p>

        <footer className={styles.footer}>
          <button type="button" onClick={onClose} disabled={submitting}>Hủy</button>
          <button type="submit" disabled={submitting || conflict}>{submitting ? 'Đang lưu…' : assigneeId ? 'Giao task' : 'Tạo task'}</button>
        </footer>
      </form>
    </aside>
  </div>;
}
