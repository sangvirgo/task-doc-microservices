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
  SHARE: 'Chia sẻ',
  DISPOSE: 'Gỡ khỏi task',
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
  const linkedItems = groups.taskGroups.flatMap(group => group.items);

  return <section className={styles.libraryPage}>
    <header className={styles.libraryHeader}>
      <div className={styles.libraryHeaderCopy}>
        <p className={styles.documentEyebrow}>Không gian tài liệu</p>
        <div className={styles.libraryTitleRow}><h1>Kho tài liệu</h1><span className={styles.scopeBadge}>{allItems.length} tài liệu</span></div>
        <p>Tìm nhanh tài liệu theo task, theo dõi deadline và kiểm tra quyền truy cập hiệu lực.</p>
      </div>
    </header>

    <div className={styles.libraryStats}>
      <article className={styles.libraryStat}><span className={styles.libraryStatIconBlue}>▧</span><div><small>Tổng tài liệu</small><strong>{allItems.length}</strong><em>Tất cả tài liệu bạn có thể xem</em></div></article>
      <article className={styles.libraryStat}><span className={styles.libraryStatIconGreen}>✓</span><div><small>Đã gắn vào task</small><strong>{linkedItems.length}</strong><em>{groups.taskGroups.length} task đang có tài liệu</em></div></article>
      <article className={styles.libraryStat}><span className={styles.libraryStatIconPurple}>⌘</span><div><small>Chưa gắn task</small><strong>{groups.unassigned.length}</strong><em>Tài liệu chưa được phân loại</em></div></article>
    </div>

    <div className={styles.libraryToolbar}>
      <label className={styles.documentSearch}><span aria-hidden="true">⌕</span><input aria-label="Tìm tài liệu hoặc task" placeholder="Tìm theo tên tài liệu hoặc task..." value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setQuery('')}>×</button>}</label>
      <span className={styles.resultCount}>{visibleItems.length} / {allItems.length} tài liệu</span>
    </div>

    {visibleItems.length > 0 ? <div className={styles.taskGroups}>
      {visibleGroups.taskGroups.map(group => <section className={styles.taskGroup} key={group.task.id}>
        <header className={styles.taskGroupHeader}>
          <div className={styles.taskHeading}><p className={styles.groupEyebrow}>Tài liệu trong task</p><h2>{taskLabel(group.task)}</h2><div className={styles.taskMeta}><span>{group.items.length} tài liệu</span><span className={styles.taskStatus}>{STATUS_LABELS[group.task.status] || group.task.status}</span><span className={group.task.is_overdue ? styles.deadlineDanger : styles.deadlineMeta}>{group.task.is_overdue ? 'Quá hạn · ' : 'Hạn · '}{formatDate(group.task.deadline)}</span></div></div>
          <Link href={'/tasks/' + group.task.id}>Mở task →</Link>
        </header>
        <div className={styles.documentCards}>{group.items.map(item => <DocumentCard item={item} taskId={group.task.id} taskTitle={taskLabel(group.task)} key={item.association_id} />)}</div>
      </section>)}
      {visibleGroups.unassigned.length > 0 && <section className={styles.taskGroup}>
        <header className={styles.taskGroupHeader}><div className={styles.taskHeading}><p className={styles.groupEyebrow}>Phân loại</p><h2>Chưa gắn task</h2><div className={styles.taskMeta}><span>{visibleGroups.unassigned.length} tài liệu</span><span className={styles.deadlineMeta}>Chưa có deadline</span></div></div><span className={styles.unassignedHint}>Cần được phân loại</span></header>
        <div className={styles.documentCards}>{visibleGroups.unassigned.map(item => <UnassignedDocumentCard item={item} key={item.id} />)}</div>
      </section>}
    </div> : <EmptyState title={query ? 'Không tìm thấy tài liệu' : 'Chưa có tài liệu'}>{query ? 'Thử tìm bằng tên task, tên file hoặc loại tài liệu khác.' : 'Tài liệu được gắn vào task sẽ xuất hiện tại đây.'}</EmptyState>}
  </section>;
}

function DocumentCard({ item, taskId, taskTitle }: { item: TaskDocument; taskId: string; taskTitle: string }) {
  const expiry = expiryMeta(item.effective_expires_at);
  return <article className={styles.documentCard}>
    <div className={styles.documentCardTop}><div className={styles.documentIdentity}><span className={styles.documentIcon}>▧</span><div className={styles.documentCopy}><Link className={styles.documentTitle} href={'/documents/' + item.document_id + '?task_id=' + taskId}>{item.title}</Link><small>{item.document_type} · Phiên bản {item.current_version}</small><div className={styles.documentContext}><span>Nằm trong task</span><Link href={'/tasks/' + taskId}>{taskTitle}</Link></div></div></div><Link className={styles.documentOpen} href={'/documents/' + item.document_id + '?task_id=' + taskId}>Xem tài liệu <span aria-hidden="true">→</span></Link></div>
    <footer><div><span className={styles.permissionTitle}>Quyền của bạn</span><div className={styles.permissionList}>{item.permissions.length ? item.permissions.map(permission => <span key={permission}>{PERMISSION_LABELS[permission] || permission}</span>) : <span className={styles.permissionEmpty}>Chưa có quyền riêng</span>}</div></div><span className={expiry.tone === 'danger' ? styles.expiryDanger : expiry.tone === 'warning' ? styles.expiryWarning : styles.expiryMeta}>{expiry.label}</span></footer>
  </article>;
}

function UnassignedDocumentCard({ item }: { item: Document }) {
  return <article className={styles.documentCard}>
    <div className={styles.documentCardTop}><div className={styles.documentIdentity}><span className={styles.documentIcon}>▧</span><div className={styles.documentCopy}><Link className={styles.documentTitle} href={'/documents/' + item.id}>{item.title}</Link><small>{item.document_type} · Phiên bản {item.current_version}</small><div className={styles.documentContext}><span>Phân loại</span><strong>Chưa gắn task</strong></div></div></div><Link className={styles.documentOpen} href={'/documents/' + item.id}>Xem tài liệu <span aria-hidden="true">→</span></Link></div>
    <footer><div><span className={styles.permissionTitle}>Quyền theo chủ sở hữu</span><div className={styles.permissionList}><span className={styles.permissionEmpty}>Đang dùng quyền mặc định</span></div></div><span className={styles.expiryMeta}>Chưa gắn vào task</span></footer>
  </article>;
}
