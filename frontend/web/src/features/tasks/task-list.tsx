'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { tasksApi } from '@/api/tasks';
import { adminApi } from '@/api/admin';
import { readSession } from '@/auth/session';
import type { MemberOption } from '@/types/admin';
import { EmptyState, ErrorState, LoadingState } from '@/components/common-states';
import type { CreateTaskInput, Task, TaskStatus } from '@/types/task';
import styles from './tasks.module.css';
import { SearchableSelect } from '@/components/searchable-select';
import { TaskAssignmentDrawer } from './task-assignment-drawer';
import { uploadTaskAttachments } from './task-document-upload';
import { TaskProgress } from './task-progress';

const filters: TaskStatus[] = ['CREATED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_REVIEW', 'APPROVED', 'NEED_REVISION', 'REJECTED', 'CANCELLED'];
const boardColumns: TaskStatus[] = ['CREATED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_REVIEW', 'APPROVED'];
const statusLabel = (value: string) => ({ CREATED: 'Mới tạo', ASSIGNED: 'Đã giao', IN_PROGRESS: 'Đang làm', WAITING_REVIEW: 'Chờ phê duyệt', APPROVED: 'Đã phê duyệt', NEED_REVISION: 'Cần chỉnh sửa', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy' } as Record<string, string>)[value] ?? value;
const initials = (value: string) => value.split(/[@ ._-]/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('') || 'U';
const dueLabel = (value: string | null) => value ? `Hạn ${new Date(value).toLocaleDateString('vi-VN')}` : 'Chưa có hạn';

export function TaskList() {
  const [items, setItems] = useState<Task[] | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [sort, setSort] = useState<'updated' | 'deadline'>('updated');
  const [composerOpen, setComposerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdTaskId, setCreatedTaskId] = useState('');
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState('');

  const load = () => { setFailed(false); setItems(null); tasksApi.list(status ? { status } : {}).then(setItems).catch(() => setFailed(true)); };
  useEffect(load, [status]);
  useEffect(() => {
    let cancelled = false;
    const refreshDirectory = () => { adminApi.directory().then(items => { if (!cancelled) setMembers(items); }).catch(() => undefined); };
    refreshDirectory();
    const focus = () => refreshDirectory();
    window.addEventListener('focus', focus);
    const timer = composerOpen ? window.setInterval(refreshDirectory, 5_000) : undefined;
    return () => { cancelled = true; window.removeEventListener('focus', focus); if (timer) window.clearInterval(timer); };
  }, [composerOpen]);

  const memberById = (id: string | null) => members.find(member => member.id === id);
  const currentUserId = readSession()?.userId;
  const visibleItems = useMemo(() => {
    if (!items) return [];
    const query = search.trim().toLowerCase();
    return [...items].filter(item => !query || `${item.title} ${item.description ?? ''}`.toLowerCase().includes(query)).sort((a, b) => {
      if (sort === 'deadline') return (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999');
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [items, search, sort]);

  const openComposer = () => { setCreateError(''); setCreatedTaskId(''); setComposerOpen(true); };
  const create = async (input: CreateTaskInput, form: HTMLFormElement) => {
    setCreateError('');
    setCreating(true);
    try {
      const created = await tasksApi.create(input);
      const attachments = await uploadTaskAttachments(form, created, currentUserId ?? '');
      setCreatedTaskId(created.id);
      setComposerOpen(false);
      setNotice(attachments.skipped ? `Đã tạo task, nhưng ${attachments.skipped} tệp chưa thể tải lên.` : input.assignee_id ? 'Đã giao task kèm tệp đính kèm.' : 'Đã tạo task ở trạng thái Chưa giao.');
      load();
    } catch {
      setCreateError('Không thể tạo task. Kiểm tra thông tin và thử lại.');
    } finally {
      setCreating(false);
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
      <span className={task.is_overdue ? styles.overdueText : styles.due}><span aria-hidden="true">◷</span> {task.is_overdue ? 'Quá hạn' : dueLabel(task.deadline)}</span>
      {member && <><span className={styles.metaDivider}>•</span><span className={styles.assignee}><span className={styles.avatar}>{initials(member.email)}</span>{member.email}</span></>}
      {task.child_task_count ? <TaskProgress compact status={task.status} completion_percentage={task.completion_percentage} child_task_count={task.child_task_count} approved_child_task_count={task.approved_child_task_count} completion_color={task.completion_color} /> : null}
    </div>;
  };
  const renderTaskRow = (task: Task) => <Link className={styles.taskRow} href={`/tasks/${task.id}`} key={task.id}>
    <span className={styles.checkCircle} aria-hidden="true" />
    <span className={styles.rowMain}><strong>{task.title}</strong>{task.description && <small>{task.description}</small>}{renderTaskMeta(task)}</span>
    <span className={styles.rowArrow} aria-hidden="true">›</span>
  </Link>;

  return <section className={styles.page}>
    <div className={styles.pageHeader}>
      <div className={styles.titleBlock}><div className={styles.titleEyebrow}><span className={styles.titleIcon}>✓</span> Quản lý công việc</div><h1>Công việc</h1><p>Tạo, giao và theo dõi công việc cùng những người được cấp quyền.</p></div>
      <div className={styles.headerActions}><button className={styles.ghostButton} type="button" aria-label="Thao tác khác">•••</button><button className={styles.primaryButton} type="button" aria-label="Tạo task (New task)" onClick={openComposer}><span>＋</span> Tạo task <span className={styles.buttonChevron}>⌄</span></button></div>
    </div>

    <div className={styles.summaryGrid}>
      <div className={styles.summaryCard}><span className={`${styles.summaryIcon} ${styles.blueIcon}`}>◈</span><div><small>Tổng công việc</small><strong>{items.length}</strong></div></div>
      <div className={styles.summaryCard}><span className={`${styles.summaryIcon} ${styles.orangeIcon}`}>◷</span><div><small>Đang thực hiện</small><strong>{countFor('IN_PROGRESS')}</strong></div></div>
      <div className={styles.summaryCard}><span className={`${styles.summaryIcon} ${styles.greenIcon}`}>✓</span><div><small>Đã phê duyệt</small><strong>{countFor('APPROVED')}</strong></div></div>
      <div className={styles.summaryCard}><span className={`${styles.summaryIcon} ${styles.redIcon}`}>!</span><div><small>Cần chú ý</small><strong>{items.filter(item => item.is_overdue || item.status === 'NEED_REVISION').length}</strong></div></div>
    </div>

    <div className={styles.workspaceCard}>
      <div className={styles.workspaceTop}><div><h2>Công việc của bạn</h2><span className={styles.taskCount}>{visibleItems.length} task</span></div><div className={styles.viewSwitch} role="tablist" aria-label="Cách xem công việc"><button type="button" className={view === 'list' ? styles.activeTab : ''} onClick={() => setView('list')} role="tab" aria-selected={view === 'list'}>▤ Danh sách</button><button type="button" className={view === 'kanban' ? styles.activeTab : ''} onClick={() => setView('kanban')} role="tab" aria-selected={view === 'kanban'}>▥ Bảng</button></div></div>
      <div className={styles.filterBar}><button className={styles.newInline} type="button" aria-label="Tạo task (New task)" onClick={openComposer}>＋ Tạo task <span>⌄</span></button><label className={styles.searchBox}><span aria-hidden="true">⌕</span><input aria-label="Tìm công việc" placeholder="Tìm công việc" value={search} onChange={event => setSearch(event.target.value)} /></label><label className={styles.compactControl}>Trạng thái<SearchableSelect aria-label="Lọc trạng thái task" value={status} onChange={event => setStatus(event.target.value)}><option value="">Tất cả</option>{filters.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</SearchableSelect></label><label className={styles.compactControl}>Sắp xếp<SearchableSelect aria-label="Sắp xếp task" value={sort} onChange={event => setSort(event.target.value as 'updated' | 'deadline')}><option value="updated">Cập nhật gần đây</option><option value="deadline">Hạn hoàn thành</option></SearchableSelect></label></div>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {visibleItems.length === 0 ? <EmptyState title={search || status ? 'Không tìm thấy công việc phù hợp' : 'Chưa có công việc'}>{search || status ? 'Thử đổi từ khóa hoặc bộ lọc để xem thêm.' : 'Tạo task đầu tiên để bắt đầu công việc.'}</EmptyState> : view === 'list' ? <div className={styles.taskList}>{visibleItems.map(renderTaskRow)}</div> : <div className={styles.board}>{boardColumns.map(column => <div className={styles.boardColumn} key={column}><div className={styles.columnHeader}><span className={`${styles.columnDot} ${styles[`${column.toLowerCase()}Dot`]}`} /><strong>{statusLabel(column)}</strong><span>{visibleItems.filter(task => task.status === column).length}</span></div><div className={styles.columnItems}>{visibleItems.filter(task => task.status === column).map(task => <Link className={styles.taskCard} href={`/tasks/${task.id}`} key={task.id}><strong>{task.title}</strong>{task.description && <small>{task.description}</small>}{renderTaskMeta(task)}</Link>)}<button className={styles.addCard} type="button" onClick={openComposer}>＋ Thêm task</button></div></div>)}</div>}
    </div>

    {composerOpen && <TaskAssignmentDrawer currentUserId={currentUserId ?? ''} members={members} submitting={creating} error={createError} onSubmit={create} onClose={() => setComposerOpen(false)} />}
    {notice && createdTaskId && <p className={styles.notice}><Link href={`/tasks/${createdTaskId}`}>Mở task để xem chi tiết và gắn tài liệu</Link></p>}
  </section>;
}
