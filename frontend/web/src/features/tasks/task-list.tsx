'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { tasksApi } from '@/api/tasks';
import { adminApi } from '@/api/admin';
import type { MemberOption } from '@/types/admin';
import { EmptyState, ErrorState, LoadingState } from '@/components/common-states';
import type { Task, TaskStatus } from '@/types/task';
import styles from './tasks.module.css';

const filters: TaskStatus[] = ['CREATED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_REVIEW', 'APPROVED', 'NEED_REVISION', 'REJECTED', 'CANCELLED'];
const boardColumns: TaskStatus[] = ['CREATED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_REVIEW', 'APPROVED'];
const statusLabel = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, char => char.toUpperCase());
const initials = (value: string) => value.split(/[@ ._-]/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('') || 'U';
const dueLabel = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No due date';

export function TaskList() {
  const [items, setItems] = useState<Task[] | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [sort, setSort] = useState<'updated' | 'deadline'>('updated');
  const [composerOpen, setComposerOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState('');

  const load = () => { setFailed(false); setItems(null); tasksApi.list(status ? { status } : {}).then(setItems).catch(() => setFailed(true)); };
  useEffect(load, [status]);
  useEffect(() => { adminApi.directory().then(setMembers).catch(() => setMembers([])); }, []);

  const memberById = (id: string | null) => members.find(member => member.id === id);
  const visibleItems = useMemo(() => {
    if (!items) return [];
    const query = search.trim().toLowerCase();
    return [...items].filter(item => !query || `${item.title} ${item.description ?? ''}`.toLowerCase().includes(query)).sort((a, b) => {
      if (sort === 'deadline') return (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999');
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [items, search, sort]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const rawDeadline = String(data.get('deadline') ?? '');
    try {
      await tasksApi.create({
        title: String(data.get('title')),
        description: String(data.get('description')) || undefined,
        assignee_id: String(data.get('assignee_id')) || undefined,
        parent_task_id: String(data.get('parent_task_id')) || undefined,
        deadline: rawDeadline ? new Date(rawDeadline).toISOString() : undefined,
      });
      form.reset();
      setComposerOpen(false);
      setNotice('Task created.');
      load();
    } catch {
      setNotice('Task could not be created. Check the details and try again.');
    }
  };

  if (failed) return <ErrorState message="Tasks could not be loaded." onRetry={load} />;
  if (!items) return <LoadingState />;

  const countFor = (state: TaskStatus) => items.filter(item => item.status === state).length;
  const renderTaskMeta = (task: Task) => {
    const member = memberById(task.assignee_id);
    return <div className={styles.taskMeta}>
      <span className={`${styles.status} ${styles[task.status.toLowerCase()]}`}>{task.blocked ? 'Blocked' : statusLabel(task.status)}</span>
      <span className={styles.metaDivider}>•</span>
      <span className={task.is_overdue ? styles.overdueText : styles.due}><span aria-hidden="true">◷</span> {task.is_overdue ? 'Overdue' : dueLabel(task.deadline)}</span>
      {member && <><span className={styles.metaDivider}>•</span><span className={styles.assignee}><span className={styles.avatar}>{initials(member.email)}</span>{member.email}</span></>}
    </div>;
  };
  const renderTaskRow = (task: Task) => <Link className={styles.taskRow} href={`/tasks/${task.id}`} key={task.id}>
    <span className={styles.checkCircle} aria-hidden="true" />
    <span className={styles.rowMain}><strong>{task.title}</strong>{task.description && <small>{task.description}</small>}{renderTaskMeta(task)}</span>
    <span className={styles.rowArrow} aria-hidden="true">›</span>
  </Link>;

  return <section className={styles.page}>
    <div className={styles.pageHeader}>
      <div className={styles.titleBlock}><div className={styles.titleEyebrow}><span className={styles.titleIcon}>✓</span> Work management</div><h1>Tasks</h1><p>Plan, assign and move work forward with your team.</p></div>
      <div className={styles.headerActions}><button className={styles.ghostButton} type="button" aria-label="More task actions">•••</button><button className={styles.primaryButton} type="button" onClick={() => setComposerOpen(true)}><span>＋</span> New task <span className={styles.buttonChevron}>⌄</span></button></div>
    </div>

    <div className={styles.summaryGrid}>
      <div className={styles.summaryCard}><span className={`${styles.summaryIcon} ${styles.blueIcon}`}>◈</span><div><small>Total tasks</small><strong>{items.length}</strong></div></div>
      <div className={styles.summaryCard}><span className={`${styles.summaryIcon} ${styles.orangeIcon}`}>◷</span><div><small>In progress</small><strong>{countFor('IN_PROGRESS')}</strong></div></div>
      <div className={styles.summaryCard}><span className={`${styles.summaryIcon} ${styles.greenIcon}`}>✓</span><div><small>Completed</small><strong>{countFor('APPROVED')}</strong></div></div>
      <div className={styles.summaryCard}><span className={`${styles.summaryIcon} ${styles.redIcon}`}>!</span><div><small>Needs attention</small><strong>{items.filter(item => item.is_overdue || item.status === 'NEED_REVISION').length}</strong></div></div>
    </div>

    <div className={styles.workspaceCard}>
      <div className={styles.workspaceTop}><div><h2>Owned</h2><span className={styles.taskCount}>{visibleItems.length} {visibleItems.length === 1 ? 'task' : 'tasks'}</span></div><div className={styles.viewSwitch} role="tablist" aria-label="Task view"><button type="button" className={view === 'list' ? styles.activeTab : ''} onClick={() => setView('list')} role="tab" aria-selected={view === 'list'}>▤ List</button><button type="button" className={view === 'kanban' ? styles.activeTab : ''} onClick={() => setView('kanban')} role="tab" aria-selected={view === 'kanban'}>▥ Kanban</button></div></div>
      <div className={styles.filterBar}><button className={styles.newInline} type="button" onClick={() => setComposerOpen(true)}>＋ New task <span>⌄</span></button><label className={styles.searchBox}><span aria-hidden="true">⌕</span><input aria-label="Search tasks" placeholder="Search tasks" value={search} onChange={event => setSearch(event.target.value)} /></label><label className={styles.compactControl}>Status<select aria-label="Filter task status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All</option>{filters.map(value => <option key={value}>{statusLabel(value)}</option>)}</select></label><label className={styles.compactControl}>Sort<select aria-label="Sort tasks" value={sort} onChange={event => setSort(event.target.value as 'updated' | 'deadline')}><option value="updated">Recently updated</option><option value="deadline">Due date</option></select></label></div>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {visibleItems.length === 0 ? <EmptyState title={search || status ? 'No matching tasks' : 'No tasks yet'}>Create your first task to start moving work forward.</EmptyState> : view === 'list' ? <div className={styles.taskList}>{visibleItems.map(renderTaskRow)}</div> : <div className={styles.board}>{boardColumns.map(column => <div className={styles.boardColumn} key={column}><div className={styles.columnHeader}><span className={`${styles.columnDot} ${styles[`${column.toLowerCase()}Dot`]}`} /><strong>{statusLabel(column)}</strong><span>{visibleItems.filter(task => task.status === column).length}</span></div><div className={styles.columnItems}>{visibleItems.filter(task => task.status === column).map(task => <Link className={styles.taskCard} href={`/tasks/${task.id}`} key={task.id}><strong>{task.title}</strong>{task.description && <small>{task.description}</small>}{renderTaskMeta(task)}</Link>)}<button className={styles.addCard} type="button" onClick={() => setComposerOpen(true)}>＋ Add task</button></div></div>)}</div>}
    </div>

    {composerOpen && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setComposerOpen(false); }}><section className={styles.composer} role="dialog" aria-modal="true" aria-labelledby="create-task-title"><div className={styles.composerHeader}><div><span className={styles.modalEyebrow}>Quick capture</span><h2 id="create-task-title">Create a new task</h2><p>Give your team a clear next step.</p></div><button className={styles.closeButton} type="button" onClick={() => setComposerOpen(false)} aria-label="Close create task dialog">×</button></div><form onSubmit={create}><label>Task title<input name="title" autoFocus required placeholder="What needs to get done?" /></label><label>Description <span className={styles.optional}>Optional</span><textarea name="description" placeholder="Add context, links or acceptance criteria..." /></label><div className={styles.formGrid}><label>Assignee<select name="assignee_id"><option value="">Unassigned</option>{members.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</select></label><label>Due date<input name="deadline" type="datetime-local" /></label></div><label>Parent task <span className={styles.optional}>Optional</span><select name="parent_task_id"><option value="">No parent task</option>{items.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><div className={styles.quickDates}><span>Quick date</span><button type="button" onClick={() => { const input = document.querySelector<HTMLInputElement>('input[name="deadline"]'); if (input) { const date = new Date(); date.setDate(date.getDate() + 1); input.value = date.toISOString().slice(0, 16); } }}>Tomorrow</button><button type="button" onClick={() => { const input = document.querySelector<HTMLInputElement>('input[name="deadline"]'); if (input) { const date = new Date(); date.setDate(date.getDate() + 7); input.value = date.toISOString().slice(0, 16); } }}>Next week</button></div><div className={styles.composerFooter}><span className={styles.composerHint}>↵ Create task <span>Esc to cancel</span></span><div><button className={styles.cancelButton} type="button" onClick={() => setComposerOpen(false)}>Cancel</button><button className={styles.primaryButton} type="submit">Create task <span>→</span></button></div></div></form></section></div>}
  </section>;
}