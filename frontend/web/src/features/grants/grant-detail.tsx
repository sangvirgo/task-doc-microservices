'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
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

const permissionLabel: Record<string, string> = {
  PREVIEW: 'Xem',
  DOWNLOAD: 'Tải xuống',
  UPDATE: 'Cập nhật',
  SHARE: 'Chia sẻ',
  TRANSFER: 'Chuyển giao',
  DISPOSE: 'Hủy',
};

const statusLabel: Record<string, string> = {
  ACTIVE: 'Đang hiệu lực',
  REVOKED: 'Đã thu hồi',
  EXPIRED: 'Đã hết hạn',
};

const statusClass = (status: string) => status === 'ACTIVE' ? styles.statusActive : status === 'REVOKED' ? styles.statusRevoked : styles.statusExpired;

const formatTime = (value: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : 'Chưa thu hồi';

const shortId = (value: string) => value.length > 8 ? value.slice(0, 8) + '…' : value;

export function GrantDetail({ id }: { id: string }) {
  const session = readSession();
  const [grant, setGrant] = useState<Grant | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => {
    setGrant(null);
    setError(false);
    grantsApi.get(id).then((grant) => {
      setGrant(grant);
    }).catch(() => setError(true));
    documentsApi.list().then(setDocuments).catch(() => setDocuments([]));
    tasksApi.list().then(setTasks).catch(() => setTasks([]));
    adminApi.directory().then(setMembers).catch(() => setMembers([]));
  };
  useEffect(load, [id]);

  if (session?.role === 'ADMIN') return <PermissionDeniedState />;
  if (!session?.userId) return <ErrorState message="Không có thông tin phiên đăng nhập. Vui lòng đăng nhập lại." />;
  if (error) return <ErrorState message="Không thể tải quyền tài liệu." onRetry={load} />;
  if (!grant) return <LoadingState />;

  const document = documents.find(item => item.id === grant.resource_id);
  const task = tasks.find(item => item.id === grant.task_id);
  const grantor = members.find(member => member.id === grant.grantor_id);
  const actor = members.find(member => member.id === grant.actor_id);
  const nameOf = (member?: MemberOption, raw?: string) => member?.email || (raw ? shortId(raw) : 'Không xác định');
  const active = grant.status === 'ACTIVE' && !grant.revoked_at;

  const revoke = async () => {
    const reason = window.prompt('Lý do thu hồi (tùy chọn)') ?? undefined;
    setMessage('Đang thu hồi quyền…');
    try {
      const result = await grantsApi.revoke(grant.id, reason);
      setGrant(result);
      setMessage(`Đã thu hồi quyền. Máy chủ trả về trạng thái ${result.status.toLowerCase()}.`);
    } catch {
      setMessage('Máy chủ không chấp nhận thu hồi quyền.');
    }
  };

  return <section className={styles.grantsPage}>
    <header className={styles.grantsHeader}>
      <div>
        <Link href="/grants" className={styles.backLink}>← Quyền tài liệu</Link>
        <p className={styles.grantsEyebrow}>Chi tiết quyền</p>
        <h1>Chi tiết quyền tài liệu</h1>
        <p>Thông tin về quyền truy cập, thời hạn hiệu lực và các thao tác quản lý quyền.</p>
      </div>
      <span className={`${statusClass(grant.status)} ${styles.grantsBadge}`}>{statusLabel[grant.status] ?? grant.status}</span>
    </header>

    <div className={styles.grantStats}>
      <article><span className={styles.statBlue}>→</span><div><small>Người nhận</small><strong>{nameOf(actor, grant.actor_id)}</strong><em>{grant.actor_id.slice(0, 8)}</em></div></article>
      <article><span className={styles.statGreen}>←</span><div><small>Được cấp bởi</small><strong>{nameOf(grantor, grant.grantor_id)}</strong><em>{grant.grantor_id.slice(0, 8)}</em></div></article>
      <article><span className={styles.statPurple}>⌛</span><div><small>Hiệu lực đến</small><strong>{formatTime(grant.effective_expires_at)}</strong><em>{task?.title ? 'Theo deadline: ' + task.title : 'Giới hạn bởi task'}</em></div></article>
    </div>

    <div className={styles.grantPanel}>
      <div className={styles.panelTop}>
        <div><p className={styles.grantsEyebrow}>THÔNG TIN QUYỀN</p><h2>Tổng quan</h2></div>
        <span className={styles.grantsBadge}>{grant.resource_type}</span>
      </div>
      <div className={styles.detailBody}>
        <div className={styles.detailRow}><span className={styles.detailLabel}>Tài liệu</span><span className={styles.detailValue}>{document?.title || grant.document_title || 'Tài liệu không xác định'}<small>Loại tài nguyên: {grant.resource_type}</small></span></div>
        <div className={styles.detailRow}><span className={styles.detailLabel}>Công việc</span><span className={styles.detailValue}>{task?.title || 'Task không xác định'}<small>Mã task: {grant.task_id.slice(0, 8)}</small></span></div>
        <div className={styles.detailRow}><span className={styles.detailLabel}>Quyền truy cập</span><span className={styles.detailValue}><div className={styles.permissionChips}>{(grant.permissions || []).map(permission => <span key={permission}>{permissionLabel[permission] || permission}</span>)}</div></span></div>
        <div className={styles.detailRow}><span className={styles.detailLabel}>Trạng thái</span><span className={styles.detailValue}><span className={statusClass(grant.status)}>{grant.status}</span></span></div>
        <div className={styles.detailRow}><span className={styles.detailLabel}>Thời hạn yêu cầu</span><span className={styles.detailValue}>{formatTime(grant.expires_at)}<small>Thời điểm người cấp yêu cầu hết hiệu lực</small></span></div>
        <div className={styles.detailRow}><span className={styles.detailLabel}>Thời hạn hiệu lực</span><span className={styles.detailValue}>{formatTime(grant.effective_expires_at)}<small>Hiệu lực thực tế sau khi áp dụng deadline task</small></span></div>
        <div className={styles.detailRow}><span className={styles.detailLabel}>Thu hồi lúc</span><span className={styles.detailValue}>{formatTime(grant.revoked_at)}</span></div>
        <div className={styles.detailRow}><span className={styles.detailLabel}>Quyền gốc</span><span className={styles.detailValue}>{grant.parent_grant_id ? <Link href={'/grants/' + grant.parent_grant_id} className={styles.documentLink}>Xem quyền gốc {shortId(grant.parent_grant_id)}</Link> : <span>Quyền được cấp trực tiếp</span>}</span></div>
        <div className={styles.detailRow}><span className={styles.detailLabel}>Mã quyền</span><span className={styles.detailValue}>{shortId(grant.id)}<small>Tạo lúc: {formatTime(grant.created_at)}</small></span></div>
      </div>
    </div>

    <div className={styles.actionGrid}>
      <div className={styles.revokePanel}>
        <div className={styles.formHeading}>
          <div><p>THU HỒI QUYỀN</p><h2>Chấm dứt quyền truy cập</h2></div>
          <span>Thu hồi sẽ vô hiệu quyền này cùng các quyền được chuyển tiếp từ nó.</span>
        </div>
        {active ? <button type="button" className={styles.revokeButton} onClick={revoke}>Thu hồi quyền</button> : <EmptyState title="Không có thao tác khả dụng">Quyền ở trạng thái {statusLabel[grant.status] ?? grant.status.toLowerCase()} nên không thể thu hồi.</EmptyState>}
      </div>
    </div>
  </section>;
}