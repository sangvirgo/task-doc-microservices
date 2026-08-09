'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { tasksApi } from '@/api/tasks';
import { documentsApi } from '@/api/documents';
import { adminApi } from '@/api/admin';
import { readSession } from '@/auth/session';
import { GatewayError } from '@/lib/errors';
import type { MemberOption } from '@/types/admin';
import { EmptyState, ErrorState, LoadingState } from '@/components/common-states';
import type { Task, TaskStatus } from '@/types/task';
import styles from './tasks.module.css';
import { SearchableSelect } from '@/components/searchable-select';
import { RecursiveSubtaskEditor, createBlankSubtask, type SubtaskDraft } from './recursive-subtask-editor';

const filters: TaskStatus[] = ['CREATED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_REVIEW', 'APPROVED', 'NEED_REVISION', 'REJECTED', 'CANCELLED'];
const boardColumns: TaskStatus[] = ['CREATED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_REVIEW', 'APPROVED'];
const grantPermissions = ['PREVIEW', 'DOWNLOAD', 'SHARE'] as const;
const statusLabel = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, char => char.toUpperCase());
const initials = (value: string) => value.split(/[@ ._-]/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('') || 'U';
const dueLabel = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Chưa có hạn';
const documentType = (file: File) => file.name.split('.').pop()?.toUpperCase() || file.type || 'FILE';
const documentTitle = (file: File) => file.name.replace(/\.[^.]+$/, '') || file.name;
const countDrafts = (items: SubtaskDraft[]): number => items.reduce((total, item) => total + 1 + countDrafts(item.children), 0);

export function TaskList() {
  const [items, setItems] = useState<Task[] | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [sort, setSort] = useState<'updated' | 'deadline'>('updated');
  const [composerOpen, setComposerOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  const [uploading, setUploading] = useState(false);
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
  const assignableMembers = currentUserId ? members.filter(member => member.id !== currentUserId) : members;
  const visibleItems = useMemo(() => {
    if (!items) return [];
    const query = search.trim().toLowerCase();
    return [...items].filter(item => !query || `${item.title} ${item.description ?? ''}`.toLowerCase().includes(query)).sort((a, b) => {
      if (sort === 'deadline') return (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999');
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [items, search, sort]);

  const addFiles = (selected: File[]) => {
    if (selected.length === 0) return;
    setFiles(current => {
      const next = [...current];
      for (const file of selected) {
        if (!next.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) next.push(file);
      }
      return next;
    });
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const rawDeadline = String(data.get('deadline') ?? '');
    const assigneeId = String(data.get('assignee_id') ?? '');
    const rawExpiry = String(data.get('expires_at') ?? '');
    const permissions = data.getAll('permissions').map(String);
    const actorIds = Array.from(new Set([readSession()?.userId, assigneeId].filter((value): value is string => Boolean(value))));
    if (files.length > 0 && (actorIds.length === 0 || !rawExpiry || permissions.length === 0)) {
      setNotice('Tài liệu cần ít nhất một người nhận quyền, thời hạn truy cập và ít nhất một quyền.');
      return;
    }

    setUploading(true);
    let created: Task;
    try {
      created = await tasksApi.create({
        title: String(data.get('title')),
        description: String(data.get('description')) || undefined,
        assignee_id: assigneeId || undefined,
        deadline: rawDeadline ? new Date(rawDeadline).toISOString() : undefined,
      });
    } catch {
      setNotice('Không thể tạo công việc. Kiểm tra thông tin và thử lại.');
      setUploading(false);
      return;
    }

    const subtaskFailures: string[] = [];
    const uploadFailures: string[] = [];
    const createSubtaskTree = async (draft: SubtaskDraft, parentId: string, label: string): Promise<void> => {
      setNotice('Đang tạo ' + label + ': ' + draft.title);
      let createdSubtask: Task;
      try {
        createdSubtask = await tasksApi.create({ title: draft.title.trim(), assignee_id: draft.assignee_id || undefined, deadline: draft.deadline ? new Date(draft.deadline).toISOString() : undefined, parent_task_id: parentId });
      } catch { subtaskFailures.push(draft.title); return; }
      const actors = Array.from(new Set([readSession()?.userId, draft.assignee_id].filter((value): value is string => Boolean(value))));
      const uploaderId = readSession()?.userId; const grants = draft.expires_at ? actors.map(actor_id => ({ actor_id, permissions: actor_id === uploaderId ? Array.from(new Set([...draft.permissions, 'PREVIEW', 'DOWNLOAD'])) : draft.permissions, expires_at: new Date(draft.expires_at).toISOString() })) : [];
      for (const file of draft.files) {
        const uploadData = new FormData();
        uploadData.set('file', file); uploadData.set('title', documentTitle(file)); uploadData.set('document_type', documentType(file)); uploadData.set('security_level', draft.security_level); uploadData.set('declared_state_secret', 'false'); uploadData.set('task_id', createdSubtask.id); uploadData.set('grants', JSON.stringify(grants));
        try {
          const result = await documentsApi.upload(uploadData, percent => setNotice('Đang tải tài liệu của ' + draft.title + ': ' + percent + '%'));
          if (!result.association || result.association.task_id !== createdSubtask.id) await documentsApi.attachToTask(createdSubtask.id, result.document.id, grants);
        } catch (reason) { const detail = reason instanceof GatewayError ? reason.status + ': ' + reason.message : 'lỗi kết nối'; uploadFailures.push(file.name + ' (' + detail + ')'); }
      }
      for (let index = 0; index < draft.children.length; index += 1) await createSubtaskTree(draft.children[index], createdSubtask.id, label + '.' + (index + 1));
    };
    for (let index = 0; index < subtasks.length; index += 1) await createSubtaskTree(subtasks[index], created.id, 'sub-task ' + (index + 1));
    const expiresAt = rawExpiry ? new Date(rawExpiry).toISOString() : '';
    const uploaderId = readSession()?.userId; const documentGrants = actorIds.map(actor_id => ({ actor_id, permissions: actor_id === uploaderId ? Array.from(new Set([...permissions, 'PREVIEW', 'DOWNLOAD'])) : permissions, expires_at: expiresAt }));
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const uploadData = new FormData();
      uploadData.set('file', file);
      uploadData.set('title', documentTitle(file));
      uploadData.set('document_type', documentType(file));
      uploadData.set('security_level', String(data.get('security_level') || 'INTERNAL'));
      uploadData.set('declared_state_secret', 'false');
      uploadData.set('task_id', created.id);
      uploadData.set('grants', JSON.stringify(documentGrants));
      try {
        const result = await documentsApi.upload(uploadData, percent => setNotice(`Đang tải tệp ${index + 1}/${files.length}: ${file.name} (${percent}%)`));
        if (!result.association || result.association.task_id !== created.id) {
          await documentsApi.attachToTask(created.id, result.document.id, documentGrants);
        }
      } catch (reason) {
        const detail = reason instanceof GatewayError ? reason.status + ': ' + reason.message : 'lỗi kết nối';
        uploadFailures.push(file.name + ' (' + detail + ')');
      }
    }

    form.reset();
    setFiles([]);
    setSubtasks([]);
    setComposerOpen(false);
    setUploading(false);
    const totalSubtasks = countDrafts(subtasks); const successes = ['Đã tạo công việc', totalSubtasks > 0 ? `${totalSubtasks - subtaskFailures.length}/${totalSubtasks} sub-task` : '', files.length > 0 ? `${files.length - uploadFailures.length}/${files.length} tài liệu` : ''].filter(Boolean).join(' · ');
    const failures = [subtaskFailures.length > 0 ? `sub-task lỗi: ${subtaskFailures.join(', ')}` : '', uploadFailures.length > 0 ? `tài liệu lỗi: ${uploadFailures.join(', ')}` : ''].filter(Boolean).join('; ');
    setNotice(`${successes}.${failures ? ` Chưa hoàn tất: ${failures}.` : ''}`);
    load();
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
      <div className={styles.titleBlock}><div className={styles.titleEyebrow}><span className={styles.titleIcon}>✓</span> Work management</div><h1>Công việc</h1><p>Plan, assign and move work forward with your team.</p></div>
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
      <div className={styles.filterBar}><button className={styles.newInline} type="button" onClick={() => setComposerOpen(true)}>＋ New task <span>⌄</span></button><label className={styles.searchBox}><span aria-hidden="true">⌕</span><input aria-label="Tìm công việc" placeholder="Tìm công việc" value={search} onChange={event => setSearch(event.target.value)} /></label><label className={styles.compactControl}>Trạng thái<SearchableSelect aria-label="Filter task status" value={status} onChange={event => setStatus(event.target.value)}><option value="">Tất cả</option>{filters.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</SearchableSelect></label><label className={styles.compactControl}>Sắp xếp<SearchableSelect aria-label="Sort tasks" value={sort} onChange={event => setSort(event.target.value as 'updated' | 'deadline')}><option value="updated">Recently updated</option><option value="deadline">Hạn hoàn thành</option></SearchableSelect></label></div>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {visibleItems.length === 0 ? <EmptyState title={search || status ? 'Không tìm thấy công việc phù hợp' : 'Chưa có công việc'}>Create your first task to start moving work forward.</EmptyState> : view === 'list' ? <div className={styles.taskList}>{visibleItems.map(renderTaskRow)}</div> : <div className={styles.board}>{boardColumns.map(column => <div className={styles.boardColumn} key={column}><div className={styles.columnHeader}><span className={`${styles.columnDot} ${styles[`${column.toLowerCase()}Dot`]}`} /><strong>{statusLabel(column)}</strong><span>{visibleItems.filter(task => task.status === column).length}</span></div><div className={styles.columnItems}>{visibleItems.filter(task => task.status === column).map(task => <Link className={styles.taskCard} href={`/tasks/${task.id}`} key={task.id}><strong>{task.title}</strong>{task.description && <small>{task.description}</small>}{renderTaskMeta(task)}</Link>)}<button className={styles.addCard} type="button" onClick={() => setComposerOpen(true)}>＋ Add task</button></div></div>)}</div>}
    </div>

    {composerOpen && <div className={styles.createDrawerBackdrop} role="presentation" onMouseDown={event => { if (!uploading && event.target === event.currentTarget) setComposerOpen(false); }}><section className={styles.createDrawer} role="dialog" aria-modal="true" aria-labelledby="create-task-title"><div className={styles.drawerHeader}><div><span className={styles.modalEyebrow}>Task command center</span><h2 id="create-task-title">Tạo công việc mới</h2><p>Tạo công việc trước, sau đó gắn các tài liệu bằng task_id vừa nhận.</p></div><button className={styles.closeButton} type="button" disabled={uploading} onClick={() => setComposerOpen(false)} aria-label="Đóng">×</button></div><form onSubmit={create}>
      <section className={styles.drawerSection}><h3>Thông tin công việc</h3><label>Tiêu đề công việc<input name="title" autoFocus required placeholder="Ví dụ: Rà soát phụ lục 2" /></label><label>Mô tả chi tiết <span className={styles.optional}>Tùy chọn</span><textarea name="description" placeholder="Yêu cầu, hướng dẫn hoặc tiêu chí hoàn thành..." /></label><div className={styles.formGrid}><label>Người được giao<SearchableSelect name="assignee_id" required={files.length > 0}><option value="">Unassigned</option>{assignableMembers.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</SearchableSelect></label><label>Hạn hoàn thành<input name="deadline" type="datetime-local" /></label></div></section>
      <section className={`${styles.drawerSection} ${styles.subtaskSection}`}><div className={styles.sectionTitle}><div><h3>Sub-task</h3><p>Tạo các công việc con cùng lúc với task cha, giống luồng LarkSuite.</p></div><span>{subtasks.length} task con</span></div><button className={styles.addSubtaskButton} type="button" onClick={() => setSubtasks(current => [...current, createBlankSubtask(Date.now() + Math.random())])}>＋ Thêm sub-task</button>{subtasks.length === 0 ? <div className={styles.subtaskEmpty}><span>↳</span><p>Chưa có task con. Bạn có thể tạo sau từ trang chi tiết task cha.</p></div> : <RecursiveSubtaskEditor value={subtasks} onChange={setSubtasks} members={assignableMembers} />}</section>      <section className={styles.drawerSection}><div className={styles.sectionTitle}><div><h3>Tài liệu đính kèm</h3><p>Tùy chọn · chọn nhiều tệp, tối đa 25 MB mỗi tệp.</p></div><span>{files.length} tệp</span></div><label className={styles.multiDropzone}><input type="file" multiple onChange={event => { const selected = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; addFiles(selected); }} /><span className={styles.uploadGlyph}>⇧</span><strong>Kéo thả hoặc chọn nhiều tài liệu</strong><small>PDF, Word, Excel, ảnh hoặc văn bản</small></label>{files.length > 0 && <ul className={styles.selectedFiles}>{files.map((file, index) => <li key={`${file.name}-${file.lastModified}`}><span className={styles.fileIcon}>▧</span><span><strong>{file.name}</strong><small>{Math.ceil(file.size / 1024)} KB</small></span><button type="button" aria-label={`Xóa ${file.name}`} onClick={() => setFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></li>)}</ul>}<div className={styles.formGrid}><label>Mức bảo mật<SearchableSelect name="security_level" defaultValue="INTERNAL"><option>PUBLIC</option><option>INTERNAL</option><option>CONFIDENTIAL</option><option>RESTRICTED</option></SearchableSelect></label><label>Hết hạn truy cập<input name="expires_at" type="datetime-local" required={files.length > 0} /></label></div><div className={styles.grantBox}><div><strong>Người nhận quyền</strong><span>Người tạo và người được giao (actor_id)</span></div><fieldset><legend>Quyền truy cập</legend>{grantPermissions.map(permission => <label key={permission}><input type="checkbox" name="permissions" value={permission} defaultChecked={permission !== 'SHARE'} /> {permission}</label>)}</fieldset></div></section>
      <div className={styles.drawerFooter}><span>{uploading ? notice || 'Đang xử lý…' : `Sẽ tạo 1 task cha${countDrafts(subtasks) ? ` + ${countDrafts(subtasks)} sub-task` : ''}${files.length ? ` + ${files.length} tài liệu` : ''}.`}</span><div><button className={styles.cancelButton} type="button" disabled={uploading} onClick={() => setComposerOpen(false)}>Hủy</button><button className={styles.primaryButton} type="submit" disabled={uploading}>{uploading ? 'Đang xử lý…' : files.length > 0 ? `Tạo & tải ${files.length} tệp` : 'Tạo công việc'} <span>→</span></button></div></div>
    </form></section></div>}
  </section>;
}
