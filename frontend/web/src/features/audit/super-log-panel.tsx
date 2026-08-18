'use client';

import { useEffect, useMemo, useState } from 'react';
import { auditApi } from '@/api/audit';
import { adminApi } from '@/api/admin';
import { readSession } from '@/auth/session';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import type { AuditEventMetadata } from '@/types/audit';
import type { MemberOption } from '@/types/admin';
import styles from '@/features/admin/admin.module.css';

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
  'document.preview.session.created': 'Mở phiên xem trước tài liệu',
  'document.preview.page.viewed': 'Xem một trang tài liệu',
  'document.download.ticket': 'Tạo vé tải xuống tài liệu',
  'document.download.redeemed': 'Tải xuống tài liệu',
  'document.download.denied': 'Tải xuống bị từ chối',
  'task.document.attached': 'Gắn tài liệu vào công việc',
  'task.document.detached': 'Gỡ tài liệu khỏi công việc',
  'record.created': 'Tạo hồ sơ',
  'record.sealed': 'Niêm phong hồ sơ',
  'record.closed': 'Đóng hồ sơ',
  'transfer.package.created': 'Tạo gói chuyển giao',
  'transfer.package.submitted': 'Nộp gói chuyển giao',
  'transfer.package.accepted': 'Chấp nhận gói chuyển giao',
  'transfer.package.rejected': 'Từ chối gói chuyển giao',
  'disposal.executed': 'Đã hủy hồ sơ',
};

const RESOURCE_LABELS: Record<string, string> = {
  AUTH_ACCOUNT: 'Tài khoản xác thực',
  USER: 'Người dùng',
  DOCUMENT: 'Tài liệu',
  TASK: 'Công việc',
  TASK_SUBMISSION: 'Kết quả công việc',
  TASK_DOCUMENT: 'Tài liệu trong công việc',
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
  disposal: 'Hủy hồ sơ',
};

const DOMAIN_TONES: Record<string, string> = {
  auth: 'tonePurple',
  user: 'toneBlue',
  permission: 'toneTeal',
  security: 'toneRed',
  task: 'toneAmber',
  document: 'toneGreen',
  record: 'toneIndigo',
  transfer: 'toneIndigo',
  disposal: 'toneRed',
};

const labelOf = (type: string) => EVENT_LABELS[type] ?? type;
const resourceOf = (type: string) => RESOURCE_LABELS[type] ?? type;
const toneOf = (type: string) => DOMAIN_TONES[type.split('.')[0]] ?? 'toneDefault';
const shortId = (id: string | null | undefined) => (id ? id.slice(0, 8) + '…' + id.slice(-4) : 'Hệ thống');
const formatTime = (value: string) => new Date(value).toLocaleString('vi-VN');

export function SuperLogPanel() {
  const session = readSession();
  const [events, setEvents] = useState<AuditEventMetadata[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [members, setMembers] = useState<MemberOption[]>([]);

  const load = () => {
    setEvents(null);
    setFailed(false);
    auditApi
      .allEvents(page, 50)
      .then((result) => {
        setEvents(result.items);
        setTotal(result.pagination.total ?? 0);
      })
      .catch(() => setFailed(true));
  };

  useEffect(() => { load(); }, [session?.userId, page]);
  useEffect(() => { let cancelled = false; adminApi.directory().then(items => { if (!cancelled) setMembers(items); }).catch(() => undefined); return () => { cancelled = true; }; }, []);

  const memberById = useMemo(() => new Map(members.map(member => [member.id, member])), [members]);
  const actorName = (id?: string | null) => id ? (memberById.get(id)?.email ?? shortId(id)) : 'Hệ thống';

  const visible = useMemo(() => {
    if (!events) return [];
    if (filter === 'ALL') return events;
    return events.filter((event) => event.event_type.split('.')[0] === filter);
  }, [events, filter]);

  if (!session?.userId) return <PermissionDeniedState />;
  if (failed) return <ErrorState message="Không thể tải siêu nhật ký." onRetry={load} />;
  if (!events) return <LoadingState />;

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return <section className={styles.auditPage}>
    <header className={styles.auditHero}>
      <div>
        <span className={styles.heroEyebrow}>SIÊU NHẬT KÝ TOÀN HỆ THỐNG</span>
        <h1>Super log</h1>
        <p>Toàn bộ thao tác của người dùng lẫn quản trị viên, được móc nối thành chuỗi băm bất biến.</p>
      </div>
      <div className={styles.heroActions}>
        <span className={styles.auditBadge}><span aria-hidden="true">▤</span>Chỉ đọc · Không ai ghi/sửa được</span>
      </div>
    </header>

    <div className={styles.auditNotice}>
      <span className={styles.noticeIcon} aria-hidden="true">i</span>
      <div>
        <strong>Mọi hoạt động, mọi tài khoản — kể cả quản trị viên</strong>
        <p>Màn hình này liệt kê mọi sự kiện kiểm toán của toàn hệ thống, dành cho cả người dùng lẫn quản trị viên, và hoàn toàn chỉ đọc. Không ai — kể cả quản trị viên — có thể chỉnh sửa, ghi đè hoặc xóa sự kiện: dữ liệu chỉ được thêm vào bởi các dịch vụ nội bộ theo chuỗi băm SHA-256.</p>
      </div>
    </div>

    <div className={styles.auditListHeader}>
      <div>
        <span className={styles.panelEyebrow}>HOẠT ĐỘNG TOÀN HỆ THỐNG</span>
        <h2>Lịch sử thao tác của mọi người dùng</h2>
      </div>
      <label className={styles.auditFilter}>
        <span>Lọc theo nhóm</span>
        <select value={filter} onChange={(event) => { setPage(1); setFilter(event.target.value); }}>
          <option value="ALL">Tất cả nhóm</option>
          {Object.entries(DOMAINS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
    </div>

    {visible.length === 0 ? <EmptyState title="Chưa có sự kiện">Chưa có sự kiện nào trong nhóm này.</EmptyState> : <div className={styles.auditList}>
      {visible.map((event) => <article className={styles.auditRow} key={event.id}>
        <span className={styles.seqBadge} title={`Số thứ tự trong chuỗi: ${event.sequence_number}`}>#{event.sequence_number}</span>
        <span className={styles.auditIcon + ' ' + styles[toneOf(event.event_type)]} aria-hidden="true">▤</span>
        <div className={styles.auditContent}>
          <strong>{labelOf(event.event_type)}</strong>
          <span className={styles.auditTypeCode}>{event.event_type}</span>
          <small>Người thao tác: <strong>{actorName(event.actor_id)}</strong> · {resourceOf(event.resource_type)} {shortId(event.resource_id)}</small>
        </div>
        <span className={styles.resourceChip}>{resourceOf(event.resource_type)}</span>
        <time className={styles.auditTime} dateTime={event.occurred_at}>{formatTime(event.occurred_at)}</time>
      </article>)}
    </div>}

    <nav className={styles.auditPager} aria-label="Phân trang siêu nhật ký">
      <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Trang trước</button>
      <span>Trang {page} / {totalPages} · {total} hoạt động</span>
      <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Trang sau →</button>
    </nav>
  </section>;
}