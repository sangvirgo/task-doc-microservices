'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState } from 'react';
import { auditApi } from '@/api/audit';
import { readSession } from '@/auth/session';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import { dateKey, downloadCSV } from '@/lib/csv';
import type { AuditChainHead, AuditChainVerification, AuditEventMetadata } from '@/types/audit';
import styles from './admin.module.css';

type AuditTone = 'purple' | 'blue' | 'teal' | 'red' | 'amber' | 'green' | 'indigo' | 'default';

const EVENT_LABELS: Record<string, string> = {
  'auth.login.failed': 'Đăng nhập thất bại',
  'auth.session.revoked': 'Thu hồi phiên đăng nhập',
  'user.locked': 'Khóa tài khoản',
  'user.unlocked': 'Mở khóa tài khoản',
  'user.capability.granted': 'Cấp quyền hệ thống',
  'user.capability.revoked': 'Thu hồi quyền hệ thống',
  'permission.decision.made': 'Quyết định phân quyền',
  'permission.grant.expired': 'Quyền truy cập hết hạn',
  'security.alert.created': 'Cảnh báo an toàn',
  'task.created': 'Tạo công việc',
  'task.deadline.changed': 'Thay đổi hạn công việc',
  'task.submitted': 'Nộp kết quả công việc',
  'task.reviewed': 'Đánh giá công việc',
  'document.created': 'Tạo tài liệu',
  'record.created': 'Tạo hồ sơ',
  'record.sealed': 'Niêm phong hồ sơ',
  'record.closed': 'Đóng hồ sơ',
  'transfer.package.created': 'Tạo gói chuyển giao',
  'transfer.package.submitted': 'Nộp gói chuyển giao',
  'transfer.package.received': 'Tiếp nhận gói chuyển giao',
  'transfer.package.accepted': 'Chấp nhận gói chuyển giao',
  'transfer.package.rejected': 'Từ chối gói chuyển giao',
  'transfer.package.archived': 'Lưu trữ gói chuyển giao',
  'transfer.package.rejection.failed': 'Từ chối gói chuyển giao thất bại',
  'retention.eligible': 'Hồ sơ đủ điều kiện lưu giữ',
  'disposal.approved': 'Phê duyệt hủy hồ sơ',
  'disposal.executed': 'Đã hủy hồ sơ',
  'disposal.failed': 'Hủy hồ sơ thất bại',
};

const RESOURCE_LABELS: Record<string, string> = {
  AUTH_ACCOUNT: 'Tài khoản xác thực',
  USER: 'Người dùng',
  DOCUMENT: 'Tài liệu',
  TASK: 'Công việc',
  TASK_SUBMISSION: 'Kết quả công việc',
  RECORD: 'Hồ sơ',
  TRANSFER_PACKAGE: 'Gói chuyển giao',
  SECURITY_ALERT: 'Cảnh báo an toàn',
  PERMISSION_GRANT: 'Quyền truy cập',
  CAPABILITY: 'Quyền hệ thống',
};

const DOMAINS: Record<string, string> = {
  auth: 'Xác thực',
  user: 'Tài khoản & quyền',
  permission: 'Phân quyền',
  security: 'An toàn',
  task: 'Công việc',
  document: 'Tài liệu',
  record: 'Hồ sơ',
  transfer: 'Lưu trữ',
  retention: 'Lưu giữ',
  disposal: 'Hủy hồ sơ',
};

const DOMAIN_TONES: Record<string, AuditTone> = {
  auth: 'purple',
  user: 'blue',
  permission: 'teal',
  security: 'red',
  task: 'amber',
  document: 'green',
  record: 'indigo',
  transfer: 'indigo',
  retention: 'amber',
  disposal: 'red',
};

const toneOf = (type: string): AuditTone => DOMAIN_TONES[type.split('.')[0]] ?? 'default';
const labelOf = (type: string): string => EVENT_LABELS[type] ?? type;
const resourceOf = (type: string): string => RESOURCE_LABELS[type] ?? type;
const shortId = (id: string | null) => (id ? `${id.slice(0, 8)}…${id.slice(-4)}` : '—');
const formatTime = (value: string) => new Date(value).toLocaleString('vi-VN');

export function AuditPanel() {
  const session = readSession();
  const [events, setEvents] = useState<AuditEventMetadata[] | null>(null);
  const [chainHead, setChainHead] = useState<AuditChainHead | null>(null);
  const [verification, setVerification] = useState<AuditChainVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setEvents(null);
    setChainHead(null);
    setFailed(false);
    Promise.all([auditApi.events(), auditApi.chainHead()])
      .then(([listed, head]) => { setEvents(listed); setChainHead(head); })
      .catch(() => setFailed(true));
  };
  useEffect(load, []);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filtered = useMemo(() => {
    if (!events) return [];
    if (filter === 'ALL') return events;
    return events.filter(event => event.event_type.startsWith(`${filter}.`));
  }, [events, filter]);

  if (session?.role !== 'ADMIN') return <PermissionDeniedState />;
  if (failed) return <ErrorState message="Không thể tải dữ liệu kiểm toán." onRetry={load} />;
  if (!events || !chainHead) return <LoadingState />;

  const verify = async () => {
    setVerifying(true);
    setStatus('');
    try {
      const result = await auditApi.verify();
      setVerification(result);
      setStatus(result.valid ? 'Chuỗi kiểm toán được xác nhận toàn vẹn.' : `Chuỗi bị phá vỡ tại sự kiện thứ ${result.broken_at ?? 'không xác định'}.`);
    } catch {
      setVerification(null);
      setStatus('Máy chủ không thể kiểm tra chuỗi kiểm toán.');
    } finally {
      setVerifying(false);
    }
  };

  const exportEvents = () => downloadCSV(`c17-audit-events-${dateKey()}.csv`, [
    ['Số thứ tự', 'Loại sự kiện', 'Tên tiếng Việt', 'Loại tài nguyên', 'Thời điểm'],
    ...filtered.map(event => [
      event.sequence_number,
      event.event_type,
      labelOf(event.event_type),
      resourceOf(event.resource_type),
      new Date(event.occurred_at).toLocaleString('vi-VN'),
    ]),
  ]);

  const newest = events.length > 0 ? events[0] : null;

  return <section className={styles.auditPage}>
    <header className={styles.auditHero}>
      <div>
        <span className={styles.heroEyebrow}>TRUNG TÂM KIỂM TOÁN</span>
        <h1>Siêu dữ liệu kiểm toán</h1>
        <p>Theo dõi chuỗi nhật ký bất biến và kiểm tra toàn vẹn từng liên kết băm.</p>
      </div>
      <span className={styles.auditBadge}><span aria-hidden="true">▤</span>Chỉ đọc · Không ghi được</span>
    </header>

    <div className={styles.auditNotice}>
      <span className={styles.noticeIcon} aria-hidden="true">i</span>
      <div>
        <strong>Nhật ký bất biến dạng chuỗi băm</strong>
        <p>Màn hình này chỉ dành cho quản trị viên và là màn hình chỉ đọc: mỗi sự kiện được thêm bởi các dịch vụ nội bộ, móc nối bằng SHA-256 với sự kiện trước đó. Mã băm, mã người thao tác, mã tài nguyên và nội dung gốc được cố ý loại bỏ khỏi màn hình này.</p>
      </div>
    </div>

    <div className={styles.chainCard}>
      <div className={styles.chainStatus}>
        <span className={`${styles.chainStateIcon} ${verification === null ? styles.chainIdle : verification.valid ? styles.chainOk : styles.chainBroken}`} aria-hidden="true">{verification === null ? '◌' : verification.valid ? '✓' : '!'}</span>
        <div>
          <small>TRẠNG THÁI CHUỖI</small>
          <strong>{verification === null ? 'Chưa kiểm tra' : verification.valid ? 'Chuỗi toàn vẹn' : `Phát hiện phá vỡ tại #${verification.broken_at ?? '?'}`}</strong>
          <span>{verification === null ? 'Nhấn nút để xác minh toàn vẹn chuỗi.' : verification.valid ? 'Mọi liên kết băm đều khớp và liên tục.' : 'Liên kết băm không khớp tại sự kiện được chỉ định.'}</span>
        </div>
        <button className={styles.verifyButton} type="button" onClick={() => void verify()} disabled={verifying}>{verifying ? 'Đang kiểm tra…' : 'Kiểm tra toàn vẹn chuỗi'}</button>
      </div>
      <div className={styles.adminStats}>
        <article className={styles.adminStat}><span className={styles.statIconBlue}>#</span><div><small>Tổng sự kiện trong chuỗi</small><strong>{chainHead.sequence}</strong><span>Số hiệu mới nhất tại đầu chuỗi</span></div></article>
        <article className={styles.adminStat}><span className={styles.statIconGreen}>▤</span><div><small>Sự kiện đang hiển thị</small><strong>{events.length}</strong><span>50 sự kiện gần nhất</span></div></article>
        <article className={styles.adminStat}><span className={styles.statIconPurple}>◷</span><div><small>Sự kiện gần nhất</small><strong>{newest ? `#${newest.sequence_number}` : '—'}</strong><span>{newest ? formatTime(newest.occurred_at) : 'Chưa có sự kiện'}</span></div></article>
      </div>
      {chainHead.last_event_id && <div className={styles.chainHeadLine}><span>Đầu chuỗi (head)</span><code title={chainHead.last_hash}>{shortId(chainHead.last_event_id)}</code><code title={chainHead.last_hash}>sha256:{chainHead.last_hash.slice(0, 16)}…</code></div>}
    </div>

    {status && <p className={styles.adminStatus} role="status">{status}</p>}

    <div className={styles.auditListHeader}>
      <div>
        <span className={styles.panelEyebrow}>NHẬT KÝ SỰ KIỆN</span>
        <h2>Hoạt động gần đây</h2>
      </div>
      <div className={styles.auditHeaderActions}>
        <div ref={exportRef} className={styles.exportWrap}>
          <button className={styles.exportButton} type="button" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen(current => !current)}><span aria-hidden="true">⬇</span> Tải xuống</button>
          {exportOpen && <div className={styles.exportMenu} role="menu">
            <button type="button" role="menuitem" onClick={() => { exportEvents(); setExportOpen(false); }}>Xuất nhật ký sự kiện (CSV)</button>
          </div>}
        </div>
        <label className={styles.auditFilter}><span>Lọc theo nhóm</span>
          <select value={filter} onChange={event => setFilter(event.target.value)} aria-label="Lọc theo nhóm sự kiện">
            <option value="ALL">Tất cả các nhóm</option>
            {Object.entries(DOMAINS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>
    </div>

    {filtered.length === 0 ? <EmptyState title="Không có sự kiện">Không tìm thấy sự kiện nào trong nhóm này.</EmptyState> : <div className={styles.auditList}>
      {filtered.map(event => { const tone = toneOf(event.event_type); return <article className={styles.auditRow} key={event.id}>
        <span className={`${styles.seqBadge}`} title={`Số thứ tự trong chuỗi: ${event.sequence_number}`}>#{event.sequence_number}</span>
        <span className={`${styles.auditIcon} ${styles[`tone${tone[0].toUpperCase()}${tone.slice(1)}`]}`} aria-hidden="true">▤</span>
        <div className={styles.auditContent}>
          <strong>{labelOf(event.event_type)}</strong>
          <span className={styles.auditTypeCode}>{event.event_type}</span>
        </div>
        <span className={styles.resourceChip}>{resourceOf(event.resource_type)}</span>
        <time className={styles.auditTime} dateTime={event.occurred_at}>{formatTime(event.occurred_at)}</time>
      </article>; })}
    </div>}
  </section>;
}
