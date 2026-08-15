'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { documentsApi } from '@/api/documents';
import { tasksApi } from '@/api/tasks';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import { readSession } from '@/auth/session';
import type { Document, TaskDocument } from '@/types/document';
import type { Task, TaskStatus } from '@/types/task';
import styles from './documents.module.css';

interface DocumentGroups {
  taskGroups: Array<{ task: Task; items: TaskDocument[] }>;
  unassigned: Document[];
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  CREATED: 'Mới tạo',
  ASSIGNED: 'Đã giao',
  IN_PROGRESS: 'Đang làm',
  WAITING_REVIEW: 'Chờ phê duyệt',
  APPROVED: 'Đã phê duyệt',
  NEED_REVISION: 'Cần chỉnh sửa',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
};

const PERMISSION_LABELS: Record<string, string> = {
  PREVIEW: 'Xem',
  DOWNLOAD: 'Tải xuống',
  UPDATE: 'Cập nhật',
  SHARE: 'Chia sẻ',
  TRANSFER: 'Chuyển giao',
  DISPOSE: 'Hủy',
};

const taskLabel = (task: Task) => task.title || 'Task ' + task.id.slice(0, 8);
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();

const formatDate = (value: string | null) => {
  if (!value) return 'Chưa thiết lập';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa thiết lập' : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const expiryMeta = (value: string | null) => {
  if (!value) return { label: 'Không giới hạn', tone: 'neutral' as const };
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return { label: 'Không xác định', tone: 'neutral' as const };
  if (time < Date.now()) return { label: 'Đã hết hạn · ' + formatDate(value), tone: 'danger' as const };
  if (time - Date.now() <= 7 * 24 * 60 * 60 * 1000) return { label: 'Sắp hết hạn · ' + formatDate(value), tone: 'warning' as const };
  return { label: 'Hết hạn · ' + formatDate(value), tone: 'neutral' as const };
};

export function DocumentList() {
  const session = readSession();
  const [groups, setGroups] = useState<DocumentGroups | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');

  const load = () => {
    setGroups(null);
    setError(false);
    Promise.all([documentsApi.list(), tasksApi.list()]).then(async ([allDocuments, taskItems]) => {
      const taskGroups = await Promise.all(taskItems.map(async task => ({ task, items: await documentsApi.taskDocuments(task.id) })));
      const associatedIds = new Set(taskGroups.flatMap(group => group.items.map(item => item.document_id)));
      setGroups({
        taskGroups: taskGroups.filter(group => group.items.length > 0),
        unassigned: allDocuments.filter(document => !associatedIds.has(document.id)),
      });
    }).catch(() => setError(true));
  };
  useEffect(load, []);

  const visibleGroups = useMemo(() => {
    if (!groups) return null;
    const term = normalize(query);
    if (!term) return groups;
    return {
      taskGroups: groups.taskGroups.map(group => {
        const taskMatches = normalize(taskLabel(group.task)).includes(term) || normalize(group.task.id).includes(term);
        const items = taskMatches ? group.items : group.items.filter(item => normalize(item.title + ' ' + item.document_type).includes(term));
        return { ...group, items };
      }).filter(group => group.items.length > 0),
      unassigned: groups.unassigned.filter(item => normalize(item.title + ' ' + item.document_type).includes(term)),
    };
  }, [groups, query]);

  if (session?.role === 'ADMIN') return <PermissionDeniedState />;
  if (error) return <ErrorState message="Không thể tải danh sách tài liệu theo task." onRetry={load} />;
  if (!groups || !visibleGroups) return <LoadingState />;

  const allItems = [...groups.taskGroups.flatMap(group => group.items), ...groups.unassigned];
  const visibleItems = [...visibleGroups.taskGroups.flatMap(group => group.items), ...visibleGroups.unassigned];
  const permissionCount = allItems.reduce((total, item) => total + ('permissions' in item ? item.permissions.length : 0), 0);
  const expiringCount = groups.taskGroups.flatMap(group => group.items).filter(item => Boolean(item.effective_expires_at)).length;

  return <section className={styles.libraryPage}>
    <header className={styles.libraryHeader}>
      <div><p className={styles.documentEyebrow}>Không gian tài liệu</p><h1>Kho tài liệu</h1><p>Tìm nhanh tài liệu theo task, theo dõi deadline và kiểm tra quyền truy cập hiệu lực.</p></div>
      <span className={styles.scopeBadge}>{allItems.length} tài liệu</span>
    </header>

    <div className={styles.libraryStats}>
      <article className={styles.libraryStat}><span className={styles.libraryStatIconBlue}>▧</span><div><small>Tổng tài liệu</small><strong>{allItems.length}</strong><em>Trong không gian của bạn</em></div></article>
      <article className={styles.libraryStat}><span className={styles.libraryStatIconGreen}>✓</span><div><small>Task có tài liệu</small><strong>{groups.taskGroups.length}</strong><em>Đã phân loại theo task</em></div></article>
      <article className={styles.libraryStat}><span className={styles.libraryStatIconPurple}>⌘</span><div><small>Quyền hiệu lực</small><strong>{permissionCount}</strong><em>{expiringCount ? expiringCount + ' file có thời hạn quyền' : 'Không có thời hạn quyền'}</em></div></article>
    </div>

    <div className={styles.libraryToolbar}>
      <label className={styles.documentSearch}><span>⌕</span><input aria-label="Tìm tài liệu hoặc task" placeholder="Tìm theo tên tài liệu hoặc task..." value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setQuery('')}>×</button>}</label>
      <span className={styles.resultCount}>{visibleItems.length} / {allItems.length} tài liệu</span>
    </div>

    {visibleItems.length > 0 ? <div className={styles.taskGroups}>
      {visibleGroups.taskGroups.map(group => <section className={styles.taskGroup} key={group.task.id}>
        <header className={styles.taskGroupHeader}>
          <div className={styles.taskHeading}><p className={styles.groupEyebrow}>Task</p><h2>{taskLabel(group.task)}</h2><div className={styles.taskMeta}><span>{group.items.length} tài liệu</span><span className={styles.taskStatus}>{STATUS_LABELS[group.task.status]}</span><span className={group.task.is_overdue ? styles.deadlineDanger : styles.deadlineMeta}>{group.task.is_overdue ? 'Quá hạn · ' : 'Hạn · '}{formatDate(group.task.deadline)}</span></div></div>
          <Link href={'/tasks/' + group.task.id}>Mở task →</Link>
        </header>
        <div className={styles.documentCards}>{group.items.map(item => <DocumentCard item={item} taskId={group.task.id} key={item.association_id} />)}</div>
      </section>)}
      {visibleGroups.unassigned.length > 0 && <section className={styles.taskGroup}>
        <header className={styles.taskGroupHeader}><div className={styles.taskHeading}><p className={styles.groupEyebrow}>Phân loại</p><h2>Chưa gắn task</h2><div className={styles.taskMeta}><span>{visibleGroups.unassigned.length} tài liệu</span><span className={styles.deadlineMeta}>Chưa có deadline</span></div></div></header>
        <div className={styles.documentCards}>{visibleGroups.unassigned.map(item => <UnassignedDocumentCard item={item} key={item.id} />)}</div>
      </section>}
    </div> : <EmptyState title={query ? 'Không tìm thấy tài liệu' : 'Chưa có tài liệu'}>{query ? 'Thử tìm bằng tên task, tên file hoặc loại tài liệu khác.' : 'Tài liệu được gắn vào task sẽ xuất hiện tại đây.'}</EmptyState>}
  </section>;
}

function DocumentCard({ item, taskId }: { item: TaskDocument; taskId: string }) {
  const expiry = expiryMeta(item.effective_expires_at);
  return <article className={styles.documentCard}>
    <div className={styles.documentCardMain}><span className={styles.documentIcon}>▧</span><div><Link href={'/documents/' + item.document_id + '?task_id=' + taskId}><strong>{item.title}</strong></Link><small>{item.document_type} · Phiên bản {item.current_version}</small></div><span className={styles.security}>{item.security_level}</span></div>
    <footer><div><span className={styles.permissionTitle}>Quyền của bạn</span><div className={styles.permissionList}>{item.permissions.map(permission => <span key={permission}>{PERMISSION_LABELS[permission] || permission}</span>)}</div></div><span className={expiry.tone === 'danger' ? styles.expiryDanger : expiry.tone === 'warning' ? styles.expiryWarning : styles.expiryMeta}>{expiry.label}</span></footer>
  </article>;
}

function UnassignedDocumentCard({ item }: { item: Document }) {
  return <article className={styles.documentCard}>
    <div className={styles.documentCardMain}><span className={styles.documentIcon}>▧</span><div><Link href={'/documents/' + item.id}><strong>{item.title}</strong></Link><small>{item.document_type} · Phiên bản {item.current_version}</small></div><span className={styles.security}>{item.security_level}</span></div>
    <footer><span className={styles.permissionTitle}>Quyền theo chủ sở hữu</span><span className={styles.expiryMeta}>Chưa gắn vào task</span></footer>
  </article>;
}
