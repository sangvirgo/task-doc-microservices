'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { tasksApi } from '@/api/tasks';
import { EmptyState, ErrorState, LoadingState } from '@/components/common-states';
import type { Task, TaskStatus } from '@/types/task';
import styles from './tasks.module.css';

const filters: TaskStatus[] = ['CREATED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_REVIEW', 'APPROVED', 'NEED_REVISION', 'REJECTED', 'CANCELLED'];

export function TaskList() {
  const [items, setItems] = useState<Task[] | null>(null); const [status, setStatus] = useState(''); const [failed, setFailed] = useState(false); const [notice, setNotice] = useState('');
  const load = () => { setFailed(false); setItems(null); tasksApi.list(status ? { status } : {}).then(setItems).catch(() => setFailed(true)); };
  useEffect(load, [status]);
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); const deadline = String(data.get('deadline')); try { await tasksApi.create({ title: String(data.get('title')), description: String(data.get('description')) || undefined, assignee_id: String(data.get('assignee_id')) || undefined, parent_task_id: String(data.get('parent_task_id')) || undefined, deadline: deadline ? new Date(deadline).toISOString() : undefined }); event.currentTarget.reset(); setNotice('Task created.'); load(); } catch { setNotice('Task could not be created. Check the details and try again.'); } };
  if (failed) return <ErrorState message="Tasks could not be loaded." onRetry={load} />;
  if (!items) return <LoadingState />;
  return <section><div className={styles.toolbar}><div><h1>Tasks</h1><p>Work assigned to you or created by you.</p></div><label>Status <select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{filters.map(value => <option key={value}>{value}</option>)}</select></label></div><form className={styles.create} onSubmit={create}><h2>Create task</h2><label>Title<input name="title" required /></label><label>Description<input name="description" /></label><label>Assignee ID<input name="assignee_id" /></label><label>Parent task ID<input name="parent_task_id" /></label><label>Deadline<input name="deadline" type="datetime-local" /></label><button>Create task</button></form>{notice && <p role="status">{notice}</p>}{items.length === 0 ? <EmptyState title="No tasks found">Try a different filter.</EmptyState> : <div className={styles.tableWrap}><table><thead><tr><th>Task</th><th>Status</th><th>Assignee</th><th>Deadline</th></tr></thead><tbody>{items.map(task => <tr key={task.id}><td><Link href={`/tasks/${task.id}`}>{task.title}</Link>{task.is_overdue && <span className={styles.overdue}>Overdue</span>}</td><td><span className={styles.status}>{task.blocked ? 'BLOCKED' : task.status}</span></td><td>{task.assignee_id ?? 'Unassigned'}</td><td>{task.deadline ? new Date(task.deadline).toLocaleDateString() : '—'}</td></tr>)}</tbody></table></div>}</section>;
}
