import type { MemberOption } from '@/types/admin';
import type { Participant, Task } from '@/types/task';
import styles from './task-people.module.css';

const initials = (value: string) => value.split(/[@ ._-]/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U';

interface TaskPeopleProps {
  task: Task;
  participants: Participant[];
  members: MemberOption[];
}

export function TaskPeople({ task, participants, members }: TaskPeopleProps) {
  const memberName = (userId: string | null | undefined) => userId ? members.find(member => member.id === userId)?.email ?? userId.slice(0, 8) : 'Chưa giao';
  const rows = [
    { label: 'Người tạo', userId: task.creator_id, value: memberName(task.creator_id) },
    { label: 'Người thực hiện', userId: task.assignee_id, value: memberName(task.assignee_id) },
    { label: 'Người review', userId: task.reviewer_id ?? task.creator_id, value: memberName(task.reviewer_id ?? task.creator_id) },
  ];
  const participantRows = participants.filter(item => !rows.some(row => row.userId === item.user_id));

  return <section className={styles.section} aria-labelledby="task-people-title">
    <div className={styles.heading}><div><p className={styles.eyebrow}>Phối hợp trong task</p><h2 id="task-people-title">Người tham gia</h2></div><span className={styles.count}>{participants.length}</span></div>
    <div className={styles.grid}>
      {rows.map(row => <div className={styles.person} key={row.label}><span className={styles.avatar}>{initials(row.value)}</span><div><span className={styles.role}>{row.label}</span><strong>{row.value}</strong></div></div>)}
      {participantRows.map(item => <div className={styles.person} key={item.id}><span className={styles.avatar}>{initials(memberName(item.user_id))}</span><div><span className={styles.role}>{item.role || 'Người tham gia'}</span><strong>{memberName(item.user_id)}</strong></div></div>)}
    </div>
  </section>;
}
