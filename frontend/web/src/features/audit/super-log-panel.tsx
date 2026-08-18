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

  TASK_CREATED: 'Tạo công việc',
  TASK_DOCUMENT_ATTACHED: 'Gắn tài liệu vào công việc',
  TASK_DOCUMENT_DETACHED: 'Gỡ tài liệu khỏi công việc',
  TASK_DOCUMENT_ATTACH_DENIED: 'Gắn tài liệu bị từ chối',
  TASK_DOCUMENT_LIST_DENIED: 'Xem tài liệu công việc bị từ chối',
  TASK_DOCUMENT_GRANT_DENIED: 'Thao tác quyền tài liệu bị từ chối',
  TASK_DOCUMENT_GRANT_LIST_DENIED: 'Xem quyền tài liệu bị từ chối',
  TASK_COMMENT_ACCESS_DENIED: 'Xem bình luận công việc bị từ chối',
  DOCUMENT_CREATED: 'Tạo tài liệu',
  DOCUMENT_UPLOAD_REJECTED: 'Tài liệu bị từ chối tải lên',
  DOCUMENT_PREVIEW_SESSION_CREATED: 'Mở phiên xem trước tài liệu',
  DOCUMENT_PREVIEW_PAGE_VIEWED: 'Xem một trang tài liệu',
  DOCUMENT_PREVIEW_SESSION_REVOKED: 'Đóng phiên xem trước tài liệu',
  DOCUMENT_PREVIEW_DENIED: 'Xem trước tài liệu bị từ chối',
  DOCUMENT_DOWNLOAD_TICKET: 'Tạo vé tải xuống tài liệu',
  DOCUMENT_DOWNLOAD_REDEEMED: 'Tải xuống tài liệu',
  DOCUMENT_DOWNLOAD_DENIED: 'Tải xuống tài liệu bị từ chối',
  DOCUMENT_GRANT_CREATED_IN_TASK: 'Cấp quyền tài liệu trong công việc',
  DOCUMENT_GRANT_UPDATED_IN_TASK: 'Cập nhật quyền tài liệu trong công việc',
  DOCUMENT_GRANT_REVOKED_IN_TASK: 'Thu hồi quyền tài liệu trong công việc',
  DOCUMENT_GRANTS_REVOKED_DUE_TO_TASK_DETACH: 'Thu hồi quyền khi gỡ tài liệu khỏi công việc',
  RECORD_CREATED: 'Tạo hồ sơ',
  RECORD_ENTRY_ADDED: 'Thêm tài liệu vào hồ sơ',
  RECORD_SEALED: 'Niêm phong hồ sơ',
  RETENTION_ELIGIBLE: 'Hồ sơ đủ điều kiện lưu trữ',
  TRANSFER_PACKAGE_CREATED: 'Tạo gói chuyển giao',
  TRANSFER_PACKAGE_SUBMITTED: 'Nộp gói chuyển giao',
  TRANSFER_PACKAGE_RECEIVED: 'Nhận gói chuyển giao',
  TRANSFER_PACKAGE_ACCEPTED: 'Chấp nhận gói chuyển giao',
  TRANSFER_PACKAGE_REJECTED: 'Từ chối gói chuyển giao',
  TRANSFER_PACKAGE_ARCHIVED: 'Lưu trữ gói chuyển giao',
  TRANSFER_PACKAGE_REJECTION_FAILED: 'Từ chối gói chuyển giao thất bại',
  DISPOSAL_APPROVED: 'Phê duyệt hủy hồ sơ',
  DISPOSAL_EXECUTED: 'Đã hủy hồ sơ',
  DISPOSAL_FAILED: 'Hủy hồ sơ thất bại',
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
const domainOf = (type: string) => {
  if (type.includes('.')) return type.split('.')[0];
  const lower = type.toLowerCase();
  if (lower.startsWith('task')) return 'task';
  if (lower.startsWith('document')) return 'document';
  if (lower.startsWith('transfer')) return 'transfer';
  if (lower.startsWith('record') || lower.startsWith('retention')) return 'record';
  if (lower.startsWith('disposal')) return 'disposal';
  if (lower.startsWith('security')) return 'security';
  return 'document';
};
const toneOf = (type: string) => DOMAIN_TONES[domainOf(type)] ?? 'toneDefault';
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
    return events.filter((event) => domainOf(event.event_type) === filter);
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