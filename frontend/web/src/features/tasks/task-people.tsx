import { useState, type FormEvent } from 'react';
import type { MemberOption } from '@/types/admin';
import type { Participant, Task } from '@/types/task';
import { SearchableSelect } from '@/components/searchable-select';
import styles from './task-people.module.css';

const initials = (value: string) => value.split(/[@ ._-]/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U';
const roleLabels: Record<string, string> = {
  CREATOR: 'Người tạo',
  ASSIGNEE: 'Người thực hiện',
  REVIEWER: 'Người duyệt',
  PARTICIPANT: 'Người tham gia',
};

interface PersonRow {
  userId: string;
  value: string;
  labels: string[];
}

interface RawPersonRow extends Omit<PersonRow, 'userId'> {
  userId: string | null;
}

interface TaskPeopleProps {
  task: Task;
  participants: Participant[];
  members: MemberOption[];
  canManageParticipants: boolean;
  addingParticipant?: boolean;
  onAddParticipant?: (event: FormEvent<HTMLFormElement>) => void;
}

export function TaskPeople({ task, participants, members, canManageParticipants, addingParticipant = false, onAddParticipant }: TaskPeopleProps) {
  const [addOpen, setAddOpen] = useState(false);
  const memberName = (userId: string | null | undefined) => userId ? members.find(member => member.id === userId)?.email ?? userId.slice(0, 8) : 'Chưa giao';
  const rows = [
    { label: 'Người tạo', userId: task.creator_id, value: memberName(task.creator_id) },
    { label: 'Người thực hiện', userId: task.assignee_id, value: memberName(task.assignee_id) },
    { label: 'Người duyệt', userId: task.reviewer_id ?? task.creator_id, value: memberName(task.reviewer_id ?? task.creator_id) },
  ];
  const participantRows = participants.filter(item => !rows.some(row => row.userId === item.user_id));
  const rawPeople: RawPersonRow[] = [...rows.map(row => ({ userId: row.userId, value: row.value, labels: [row.label] })), ...participantRows.map(item => ({ labels: [roleLabels[item.role] ?? 'Người tham gia'], userId: item.user_id, value: memberName(item.user_id) }))];
  const people: PersonRow[] = rawPeople
    .filter((row): row is PersonRow => Boolean(row.userId))
    .reduce<PersonRow[]>((unique, row) => {
      const existing = unique.find(candidate => candidate.userId === row.userId);
      if (existing && !existing.labels.includes(row.labels[0])) existing.labels.push(row.labels[0]);
      else unique.push(row);
      return unique;
    }, []);

  return <section className={styles.section} aria-labelledby="task-people-title">
    <div className={styles.heading}><div><p className={styles.eyebrow}>Phối hợp trong công việc</p><h2 id="task-people-title">Người tham gia <span>({people.length})</span></h2></div>{canManageParticipants && <button className={styles.addButton} type="button" aria-expanded={addOpen} aria-controls={'task-add-participant-' + task.id} onClick={() => setAddOpen(open => !open)}>+ Thêm người tham gia</button>}</div>
    <div className={styles.peopleList} role="list" aria-label="Danh sách người tham gia">
      {people.map(row => <div className={styles.personCard} role="listitem" key={row.userId}><span className={styles.avatar} aria-hidden="true">{initials(row.value)}</span><div className={styles.personInfo}><strong>{row.value}</strong><span>{row.labels.join(' · ')}</span></div></div>)}
    </div>
    {canManageParticipants && onAddParticipant && addOpen && <div id={'task-add-participant-' + task.id} className={styles.addForm} aria-label="Thêm người tham gia"><div className={styles.addFormHeading}><strong>Thêm người vào công việc</strong><span>Chọn thành viên để phối hợp trong task này.</span></div><form onSubmit={onAddParticipant}><label>Người tham gia<SearchableSelect name="user_id" aria-label="Chọn người tham gia" required defaultValue=""><option value="" disabled>Chọn nhân viên</option>{members.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</SearchableSelect></label><div className={styles.addFormActions}><button type="submit" disabled={addingParticipant}>Thêm người</button><button type="button" className={styles.cancelButton} onClick={() => setAddOpen(false)}>Hủy</button></div></form></div>}
  </section>;
}
