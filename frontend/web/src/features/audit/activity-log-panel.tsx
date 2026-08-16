'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/api/admin';
import { auditApi } from '@/api/audit';
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
  'task.document.attached': 'Gắn tài liệu vào công việc',
  'task.document.detached': 'Gỡ tài liệu khỏi công việc',
};

const DOMAINS: Record<string, string> = {
  auth: 'Xác thực',
  user: 'Tài khoản & quyền',
  permission: 'Phân quyền',
  security: 'An toàn',
  task: 'Công việc',
  document: 'Tài liệu',
};

const DOMAIN_TONES: Record<string, string> = {
  auth: 'tonePurple',
  user: 'toneBlue',
  permission: 'toneTeal',
  security: 'toneRed',
  task: 'toneAmber',
  document: 'toneGreen',
};

const labelOf = (type: string) => EVENT_LABELS[type] ?? type;
const toneOf = (type: string) => DOMAIN_TONES[type.split('.')[0]] ?? 'toneDefault';
const shortId = (id: string | null | undefined) => id ? id.slice(0, 8) + '…' + id.slice(-4) : 'Hệ thống';
const formatTime = (value: string) => new Date(value).toLocaleString('vi-VN');

export function ActivityLogPanel() {
  const session = readSession();
  const [events, setEvents] = useState<AuditEventMetadata[] | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = () => {
    if (!session?.userId) return;
    setEvents(null);
    setFailed(false);
    Promise.all([
      auditApi.events(page, 50, filter === 'ALL' ? undefined : filter),
      adminApi.directory().catch(() => [] as MemberOption[]),
    ])
      .then(([result, directory]) => {
        setEvents(result.items);
        setTotal(result.pagination.total ?? 0);
        setMembers(directory);
      })
      .catch(() => setFailed(true));
  };

  useEffect(() => { load(); }, [session?.userId, page, filter]);

  if (!session?.userId) return <PermissionDeniedState />;
  if (failed) return <ErrorState message="Không thể tải nhật ký hoạt động." onRetry={load} />;
  if (!events) return <LoadingState />;

  const memberById = new Map(members.map((member) => [member.id, member]));
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return <section className={styles.auditPage}>
    <header className={styles.auditHero}>
      <div>
        <span className={styles.heroEyebrow}>NHẬT KÝ KHÔNG GIAN LÀM VIỆC</span>
        <h1>Nhật ký hoạt động</h1>
        <p>Tất cả thao tác quan trọng của nhân viên và quản trị viên được hiển thị tại đây.</p>
      </div>
      <div className={styles.heroActions}>
        <span className={styles.auditBadge}><span aria-hidden="true">▤</span>Chỉ đọc · Không thể sửa</span>
      </div>
    </header>

    <div className={styles.auditNotice}>
      <span className={styles.noticeIcon} aria-hidden="true">i</span>
      <div>
        <strong>Nhật ký chỉ đọc</strong>
        <p>Không ai, kể cả quản trị viên, có thể chỉnh sửa hoặc xóa sự kiện. Nhật ký được ghi bởi các dịch vụ nội bộ để theo dõi minh bạch hoạt động trong hệ thống.</p>
      </div>
    </div>

    <div className={styles.auditListHeader}>
      <div>
        <span className={styles.panelEyebrow}>HOẠT ĐỘNG GẦN ĐÂY</span>
        <h2>Lịch sử thao tác</h2>
      </div>
      <label className={styles.auditFilter}>
        <span>Lọc theo nhóm</span>
        <select value={filter} onChange={(event) => { setPage(1); setFilter(event.target.value); }}>
          <option value="ALL">Tất cả nhóm</option>
          {Object.entries(DOMAINS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
    </div>

    {events.length === 0 ? <EmptyState title="Chưa có hoạt động">Chưa có sự kiện nào được ghi nhận.</EmptyState> : <div className={styles.auditList}>
      {events.map((event) => <article className={styles.auditRow} key={event.id}>
        <span className={styles.seqBadge}>#{event.sequence_number}</span>
        <span className={styles.auditIcon + ' ' + styles[toneOf(event.event_type)]} aria-hidden="true">▤</span>
        <div className={styles.auditContent}>
          <strong>{labelOf(event.event_type)}</strong>
          <span className={styles.auditTypeCode}>{event.event_type}</span>
          <small>Người thao tác: {memberById.get(event.actor_id ?? '')?.email ?? shortId(event.actor_id)}</small>
        </div>
        <span className={styles.resourceChip}>{event.resource_type} · {shortId(event.resource_id)}</span>
        <time className={styles.auditTime} dateTime={event.occurred_at}>{formatTime(event.occurred_at)}</time>
      </article>)}
    </div>}

    <nav className={styles.auditPager} aria-label="Phân trang nhật ký hoạt động">
      <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Trang trước</button>
      <span>Trang {page} / {totalPages} · {total} hoạt động</span>
      <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Trang sau →</button>
    </nav>
  </section>;
}
