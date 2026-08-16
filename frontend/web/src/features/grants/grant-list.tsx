'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { grantsApi } from '@/api/grants';
import { documentsApi } from '@/api/documents';
import { tasksApi } from '@/api/tasks';
import { adminApi } from '@/api/admin';
import { readSession } from '@/auth/session';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import type { Grant } from '@/types/grant';
import type { Document } from '@/types/document';
import type { Task } from '@/types/task';
import type { MemberOption } from '@/types/admin';
import styles from './grants.module.css';

type GrantView = 'issued' | 'received';

const formatDateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : 'Chưa thu hồi';

const permissionLabel: Record<string, string> = {
  PREVIEW: 'Xem',
  DOWNLOAD: 'Tải xuống',
  UPDATE: 'Cập nhật',
  SHARE: 'Chia sẻ',
  TRANSFER: 'Chuyển giao',
  DISPOSE: 'Hủy',
};

export function GrantList() {
  const session = readSession();
  const [issued, setIssued] = useState<Grant[] | null>(null);
  const [received, setReceived] = useState<Grant[] | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [view, setView] = useState<GrantView>('issued');
  const [error, setError] = useState(false);

  const loading = useRef(false);

  const load = () => {
    if (!session?.userId || session.role === 'ADMIN') return;
    if (loading.current) return;
    loading.current = true;
    setIssued(null);
    setReceived(null);
    setError(false);
    Promise.all([
      grantsApi.list({ grantor_id: session.userId }),
      grantsApi.list({ actor_id: session.userId }),
      documentsApi.list().catch(() => [] as Document[]),
      tasksApi.list().catch(() => [] as Task[]),
      adminApi.directory().catch(() => [] as MemberOption[]),
    ]).then(([issuedGrants, receivedGrants, documentItems, taskItems, memberItems]) => {
      setIssued(issuedGrants);
      setReceived(receivedGrants);
      setDocuments(documentItems);
      setTasks(taskItems);
      setMembers(memberItems);
    }).catch(() => setError(true))
      .finally(() => { loading.current = false; });
  };

  useEffect(load, [session?.userId, session?.role]);

  if (session?.role === 'ADMIN') return <PermissionDeniedState />;
  if (!session?.userId) return <ErrorState message="Không có thông tin phiên đăng nhập. Vui lòng đăng nhập lại." />;
  if (error) return <ErrorState message="Không thể tải danh sách quyền tài liệu." onRetry={load} />;
  if (!issued || !received) return <LoadingState />;

  const visibleGrants = view === 'issued' ? issued : received;
  const documentById = new Map(documents.map(document => [document.id, document]));
  const taskById = new Map(tasks.map(task => [task.id, task]));
  const memberById = new Map(members.map(member => [member.id, member]));
  const documentTitle = (grant: Grant) => documentById.get(grant.resource_id)?.title || 'Tài liệu không xác định';
  const taskTitle = (grant: Grant) => taskById.get(grant.task_id)?.title || 'Task không xác định';
  const personName = (id?: string) => id ? memberById.get(id)?.email || id.slice(0, 8) : 'Unknown recipient';
  const activeCount = visibleGrants.filter(grant => grant.status === 'ACTIVE').length;
  const revokedCount = visibleGrants.filter(grant => grant.status === 'REVOKED').length;

  return <section className={styles.grantsPage}>
    <header className={styles.grantsHeader}><div><p className={styles.grantsEyebrow}>Quản trị quyền truy cập</p><h1>Quyền tài liệu</h1><p>Theo dõi tài liệu bạn đã cấp, tài liệu được cấp cho bạn và thời hạn hiệu lực.</p></div><span className={styles.grantsBadge}>{issued.length + received.length} bản ghi quyền</span></header>

    <div className={styles.grantStats}>
      <article><span className={styles.statBlue}>↗</span><div><small>Đã cấp bởi tôi</small><strong>{issued.length}</strong><em>{view === 'issued' ? activeCount + ' đang hiệu lực' : 'Chọn tab để xem'}</em></div></article>
      <article><span className={styles.statGreen}>↙</span><div><small>Được cấp cho tôi</small><strong>{received.length}</strong><em>{view === 'received' ? activeCount + ' đang hiệu lực' : 'Chọn tab để xem'}</em></div></article>
      <article><span className={styles.statPurple}>⌛</span><div><small>Đã thu hồi</small><strong>{revokedCount}</strong><em>Trong danh sách đang xem</em></div></article>
    </div>

    <form className={styles.grantForm} onSubmit={create}>
      <div className={styles.formHeading}><div><p>CẤP QUYỀN MỚI</p><h2>Chia sẻ tài liệu cho thành viên trong task</h2></div><span>Quyền sẽ bị giới hạn bởi deadline task</span></div>
      <div className={styles.formGrid}>
        <label>Người nhận<SearchableSelect name="actor_id" required defaultValue="" disabled={!selectedTaskId || taskDocumentsLoading}><option value="" disabled>Chọn nhân viên</option>{eligibleMembers.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</SearchableSelect></label>
        <label>Tài liệu<SearchableSelect name="resource_id" required defaultValue="" disabled={!selectedTaskId || taskDocumentsLoading}><option value="" disabled>{taskDocumentsLoading ? "Đang tải tài liệu…" : selectedTaskId ? "Chọn tài liệu trong task" : "Chọn task trước"}</option>{taskDocuments.map(document => <option key={document.document_id} value={document.document_id}>{document.title}</option>)}</SearchableSelect></label>
        <label>Công việc<SearchableSelect name="task_id" required value={selectedTaskId} onChange={event => loadTaskDocuments(event.target.value)}><option value="" disabled>Chọn công việc</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</SearchableSelect></label>
        <label>Quyền truy cập <span>Phân tách bằng dấu phẩy</span><input name="permissions" required placeholder="PREVIEW, DOWNLOAD" /></label>
        <label>Thời hạn<input name="expires_at" type="datetime-local" required /></label>
        <div className={styles.formActions}><button type="submit">Cấp quyền</button>{status && <p role="status">{status}</p>}</div>
      </div>
    </form>

    <div className={styles.grantPanel}>
      <div className={styles.panelTop}><div><p className={styles.grantsEyebrow}>DANH SÁCH QUYỀN</p><h2>{view === 'issued' ? 'Tài liệu tôi đã cấp' : 'Tài liệu được cấp cho tôi'}</h2></div><div className={styles.tabs} role="tablist" aria-label="Loại quyền tài liệu"><button type="button" role="tab" aria-selected={view === 'issued'} className={view === 'issued' ? styles.tabActive : styles.tab} onClick={() => setView('issued')}>Đã cấp <b>{issued.length}</b></button><button type="button" role="tab" aria-selected={view === 'received'} className={view === 'received' ? styles.tabActive : styles.tab} onClick={() => setView('received')}>Được cấp <b>{received.length}</b></button></div></div>
      {visibleGrants.length === 0 ? <EmptyState title={view === 'issued' ? 'Bạn chưa cấp quyền nào' : 'Bạn chưa được cấp quyền nào'}>Các quyền tài liệu sẽ xuất hiện ở đây.</EmptyState> : <div className={styles.grantTableWrap}><table className={styles.grantTable}><thead><tr><th>Tài liệu</th><th>{view === 'issued' ? 'Người nhận' : 'Được cấp bởi'}</th><th>Task</th><th>Quyền</th><th>Trạng thái</th><th>Hiệu lực đến</th></tr></thead><tbody>{visibleGrants.map(grant => <tr key={grant.id}><td><Link href={'/grants/' + grant.id} className={styles.documentLink}>{documentTitle(grant)}</Link><small>{grant.resource_type}</small></td><td>{personName(view === 'issued' ? grant.actor_id : grant.grantor_id)}</td><td>{taskTitle(grant)}</td><td><div className={styles.permissionChips}>{(grant.permissions || []).map(permission => <span key={permission}>{permissionLabel[permission] || permission}</span>)}</div></td><td><span className={grant.status === 'ACTIVE' ? styles.statusActive : grant.status === 'REVOKED' ? styles.statusRevoked : styles.statusExpired}>{grant.status}</span></td><td><strong>{formatDateTime(grant.effective_expires_at)}</strong><small>{grant.revoked_at ? 'Thu hồi lúc ' + formatDateTime(grant.revoked_at) : 'Chưa thu hồi'}</small></td></tr>)}</tbody></table></div>}
    </div>
  </section>;
}
