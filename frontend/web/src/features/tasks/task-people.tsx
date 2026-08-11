import { useState, type FormEvent } from 'react';
import type { MemberOption } from '@/types/admin';
import type { Participant, Task } from '@/types/task';
import { SearchableSelect } from '@/components/searchable-select';
import styles from './task-people.module.css';

const initials = (value: string) => value.split(/[@ ._-]/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U';

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
    { label: 'Người review', userId: task.reviewer_id ?? task.creator_id, value: memberName(task.reviewer_id ?? task.creator_id) },
  ];
  const participantRows = participants.filter(item => !rows.some(row => row.userId === item.user_id));
  const people = [...rows, ...participantRows.map(item => ({ label: item.role || 'Người tham gia', userId: item.user_id, value: memberName(item.user_id) }))]
    .filter(row => row.userId)
    .reduce<typeof rows>((unique, row) => {
      const existing = unique.find(candidate => candidate.userId === row.userId);
      if (existing) existing.label = `${existing.label} · ${row.label}`;
      else unique.push(row);
      return unique;
    }, []);

  return <section className={styles.section} aria-labelledby="task-people-title">
    <div className={styles.heading}><div><p className={styles.eyebrow}>Phối hợp trong task</p><h2 id="task-people-title">Người tham gia <span>{people.length}</span></h2></div>{canManageParticipants && <button className={styles.addButton} type="button" aria-expanded={addOpen} aria-controls={`task-add-participant-${task.id}`} onClick={() => setAddOpen(open => !open)}>+ Thêm người</button>}</div>
    <div className={styles.people}>
      <div className={styles.avatarStack}>{people.map(row => <span className={styles.avatar} key={row.userId} title={`${row.label}: ${row.value}`}>{initials(row.value)}</span>)}</div>
      <div className={styles.roles}>{people.map(row => <span key={`${row.label}-${row.userId}`}><b>{row.label}</b>{row.value}</span>)}</div>
    </div>
    {canManageParticipants && onAddParticipant && <details id={`task-add-participant-${task.id}`} className={styles.addForm} open={addOpen} onToggle={event => setAddOpen(event.currentTarget.open)}><summary>Thêm người vào task</summary><form onSubmit={onAddParticipant}><SearchableSelect name="user_id" aria-label="Chọn người tham gia" required defaultValue=""><option value="" disabled>Chọn nhân viên</option>{members.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</SearchableSelect><input name="role" placeholder="Vai trò (tùy chọn)" /><button type="submit" disabled={addingParticipant}>Thêm</button></form></details>}
  </section>;
}
