'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { ChangeEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { documentsApi } from '@/api/documents';
import { tasksApi } from '@/api/tasks';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import { readSession } from '@/auth/session';
import { GatewayError } from '@/lib/errors';
import type { Document, TaskDocument } from '@/types/document';
import type { Task } from '@/types/task';
import styles from './documents.module.css';
import { SearchableSelect } from '@/components/searchable-select';

interface DocumentGroups {
  taskGroups: Array<{ task: Task; items: TaskDocument[] }>;
  unassigned: Document[];
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const taskLabel = (task: Task) => task.title || `Task ${task.id.slice(0, 8)}`;

export function DocumentList() {
  const session = readSession();
  const [groups, setGroups] = useState<DocumentGroups | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState(false);
  const [file, setFile] = useState<File>();
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [progress, setProgress] = useState('');

  const load = () => {
    setGroups(null);
    setError(false);
    Promise.all([documentsApi.list(), tasksApi.list()]).then(async ([allDocuments, taskItems]) => {
      const taskGroups = await Promise.all(taskItems.map(async task => ({ task, items: await documentsApi.taskDocuments(task.id) })));
      const associatedIds = new Set(taskGroups.flatMap(group => group.items.map(item => item.document_id)));
      setTasks(taskItems);
      setGroups({ taskGroups: taskGroups.filter(group => group.items.length > 0), unassigned: allDocuments.filter(document => !associatedIds.has(document.id)) });
    }).catch(() => setError(true));
  };
  useEffect(load, []);

  const upload = async (event: ChangeEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedTask = tasks.find(task => task.id === selectedTaskId);
    if (!file || !selectedTask) { setProgress('Chọn tệp và task cần gắn trước khi tải lên.'); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setProgress('Tệp vượt quá giới hạn 25 MB và chưa được tải lên.'); return; }
    if (!session?.userId) { setProgress('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'); return; }
    const data = new FormData(event.currentTarget);
    const actors = Array.from(new Set([session.userId, selectedTask.creator_id, selectedTask.assignee_id, selectedTask.reviewer_id].filter((value): value is string => Boolean(value))));
    const grants = actors.map(actor_id => ({ actor_id, permissions: ['PREVIEW', 'DOWNLOAD'], expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }));
    data.set('file', file);
    data.set('task_id', selectedTask.id);
    data.set('title', String(data.get('title') || file.name.replace(/\.[^.]+$/, '') || file.name));
    data.set('document_type', String(data.get('document_type') || file.name.split('.').pop()?.toUpperCase() || file.type || 'FILE'));
    data.set('security_level', String(data.get('security_level') || 'INTERNAL'));
    data.set('declared_state_secret', 'false');
    data.set('grants', JSON.stringify(grants));
    setProgress('Đang tải tài liệu lên… 0%');
    try {
      await documentsApi.upload(data, percent => setProgress(`Đang tải tài liệu lên… ${percent}%`));
      event.currentTarget.reset();
      setFile(undefined);
      setSelectedTaskId('');
      setProgress('Đã tải và phân loại tài liệu theo task.');
      load();
    } catch (reason) {
      setProgress(session.role === 'ADMIN' ? 'Tài khoản ADMIN không được phép tải tài liệu.' : reason instanceof GatewayError ? `Upload thất bại (${reason.status}): ${reason.message}` : 'Upload thất bại do lỗi kết nối.');
    }
  };

  if (session?.role === 'ADMIN') return <PermissionDeniedState />;
  if (error) return <ErrorState message="Không thể tải danh sách tài liệu theo task." onRetry={load} />;
  if (!groups) return <LoadingState />;
  const hasDocuments = groups.taskGroups.length > 0 || groups.unassigned.length > 0;

  return <section className={styles.documentPage}>
    <header className={styles.head}><div><p className={styles.documentEyebrow}>Không gian tài liệu</p><h1>Tài liệu</h1><p>Tài liệu được phân loại theo task và hiển thị đúng quyền truy cập hiệu lực.</p></div><span className={styles.scopeBadge}>{groups.taskGroups.length} task có tài liệu</span></header>
    <form className={styles.upload} onSubmit={upload}>
      <div className={styles.uploadIntro}><span className={styles.uploadIcon}>＋</span><div><h2>Tải tài liệu lên</h2><p>Chọn task trước để tài liệu được gắn đúng ngữ cảnh và cấp quyền cho nhóm liên quan.</p></div></div>
      <label className={styles.dropzone}>Tệp tải lên<input type="file" onChange={event => setFile(event.target.files?.[0])} /><span className={styles.dropTitle}>{file ? file.name : 'Chọn tệp hoặc kéo thả vào đây'}</span><span className={styles.dropHint}>{file ? `${Math.ceil(file.size / 1024)} KB đã chọn` : 'Tối đa 25 MB'}</span></label>
      <label>Chọn task để upload<SearchableSelect name="task_id" value={selectedTaskId} onChange={event => setSelectedTaskId(event.target.value)} aria-label="Chọn task để upload"><option value="" disabled>Chọn task cần gắn</option>{tasks.map(task => <option key={task.id} value={task.id}>{taskLabel(task)}</option>)}</SearchableSelect></label>
      <label>Tên hiển thị <span>Tùy chọn</span><input name="title" placeholder="Mặc định theo tên file" /></label>
      <label>Security level <SearchableSelect name="security_level" defaultValue="INTERNAL"><option value="PUBLIC">PUBLIC</option><option value="INTERNAL">INTERNAL</option><option value="CONFIDENTIAL">CONFIDENTIAL</option><option value="RESTRICTED">RESTRICTED</option></SearchableSelect></label>
      <input type="hidden" name="document_type" /><input type="hidden" name="declared_state_secret" value="false" />
      <div className={styles.uploadFooter}><span>{progress || 'Quyền mặc định: PREVIEW · DOWNLOAD theo task'}</span><button type="submit">Tải tài liệu lên</button></div>
    </form>
    {hasDocuments ? <div className={styles.taskGroups}>
      {groups.taskGroups.map(group => <section className={styles.taskGroup} key={group.task.id}><header className={styles.taskGroupHeader}><div><p className={styles.groupEyebrow}>Task</p><h2>{taskLabel(group.task)}</h2><span>{group.items.length} tài liệu</span></div><Link href={`/tasks/${group.task.id}`}>Mở task →</Link></header><div className={styles.documentCards}>{group.items.map(item => <DocumentCard item={item} taskId={group.task.id} key={item.association_id} />)}</div></section>)}
      {groups.unassigned.length > 0 && <section className={styles.taskGroup}><header className={styles.taskGroupHeader}><div><p className={styles.groupEyebrow}>Phân loại</p><h2>Chưa gắn task</h2><span>{groups.unassigned.length} tài liệu</span></div></header><div className={styles.documentCards}>{groups.unassigned.map(item => <article className={styles.documentCard} key={item.id}><span className={styles.documentIcon}>▧</span><div><Link href={`/documents/${item.id}`}><strong>{item.title}</strong></Link><small>{item.document_type} · v{item.current_version}</small></div><span className={styles.security}>{item.security_level}</span><footer><span>Quyền theo chủ sở hữu</span></footer></article>)}</div></section>}
    </div> : <EmptyState title="Chưa có tài liệu theo task">Tài liệu mới tải lên sẽ xuất hiện trong nhóm task tương ứng.</EmptyState>}
  </section>;
}

function DocumentCard({ item, taskId }: { item: TaskDocument; taskId: string }) {
  return <article className={styles.documentCard}><span className={styles.documentIcon}>▧</span><div><Link href={`/documents/${item.document_id}?task_id=${taskId}`}><strong>{item.title}</strong></Link><small>{item.document_type} · v{item.current_version}</small></div><span className={styles.security}>{item.security_level}</span><footer><span>Quyền hiệu lực</span><div className={styles.permissionList}>{item.permissions.map(permission => <span key={permission}>{permission}</span>)}</div></footer></article>;
}
