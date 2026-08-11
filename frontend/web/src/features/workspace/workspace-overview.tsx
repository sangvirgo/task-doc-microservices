'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { statisticsApi } from '@/api/statistics';
import { readSession } from '@/auth/session';
import { ErrorState, LoadingState } from '@/components/common-states';
import type { StatisticsOverview, StatisticsScope } from '@/types/statistics';
import type { TaskStatus } from '@/types/task';
import styles from './workspace-overview.module.css';

const statuses: TaskStatus[] = ['CREATED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_REVIEW', 'APPROVED', 'NEED_REVISION', 'REJECTED', 'CANCELLED'];
const statusLabel = (value: string) => ({ CREATED: 'Mới tạo', ASSIGNED: 'Đã giao', IN_PROGRESS: 'Đang làm', WAITING_REVIEW: 'Chờ phê duyệt', APPROVED: 'Đã phê duyệt', NEED_REVISION: 'Cần chỉnh sửa', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy' } as Record<string, string>)[value] ?? value;
const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const displayDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
const displayDateTime = (value: string) => new Date(value).toLocaleString('vi-VN');

function rangeForOverview(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: dateKey(from), to: dateKey(to) };
}

function StatCard({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return <article className={styles.statCard}><span className={`${styles.statIcon} ${styles[tone]}`} aria-hidden="true">{icon}</span><div><span>{label}</span><strong>{value}</strong></div></article>;
}

export function WorkspaceOverview() {
  const session = readSession();
  const scope: StatisticsScope = session?.role === 'ADMIN' ? 'ORGANIZATION' : 'ME';
  const [selectedRange, setSelectedRange] = useState(rangeForOverview);
  const [appliedRange, setAppliedRange] = useState(rangeForOverview);
  const [overview, setOverview] = useState<StatisticsOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const [rangeError, setRangeError] = useState('');
  const load = () => {
    setFailed(false);
    setOverview(null);
    statisticsApi.overview(scope, appliedRange.from, appliedRange.to).then(setOverview).catch(() => setFailed(true));
  };
  useEffect(load, [scope, appliedRange]);
  const applyRange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedRange.from > selectedRange.to) { setRangeError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.'); return; }
    setRangeError('');
    setAppliedRange(selectedRange);
  };

  if (!session?.userId) return <ErrorState message="Không tìm thấy phiên đăng nhập. Vui lòng đăng nhập lại." />;
  if (failed) return <ErrorState message="Không thể tải số liệu tổng quan từ máy chủ." onRetry={load} />;
  if (!overview) return <LoadingState />;

  const maxTrend = Math.max(1, ...overview.task_trend.flatMap(item => [item.created, item.completed]));
  const recentTrend = overview.task_trend.slice(-7);
  return <section className={styles.page}>
    <header className={styles.pageHeader}>
      <div><p className={styles.eyebrow}>{overview.scope === 'ORGANIZATION' ? 'Không gian quản trị' : 'Không gian làm việc'}</p><h1>Tổng quan</h1><p className={styles.subtitle}>Nắm nhanh việc cần làm, tài liệu được phép xem và các cập nhật mới nhất.</p></div>
      <form className={styles.range} onSubmit={applyRange} aria-label="Lọc thời gian tổng quan"><span>Dữ liệu trong khoảng</span><div className={styles.dateFields}><label>Từ ngày<input aria-label="Từ ngày" type="date" value={selectedRange.from} max={selectedRange.to} onChange={event => setSelectedRange(range => ({ ...range, from: event.target.value }))} /></label><label>Đến ngày<input aria-label="Đến ngày" type="date" value={selectedRange.to} min={selectedRange.from} onChange={event => setSelectedRange(range => ({ ...range, to: event.target.value }))} /></label></div><div className={styles.rangeFooter}><strong>{displayDate(overview.range.from)} — {displayDate(overview.range.to)}</strong><button type="submit">Áp dụng</button></div>{rangeError && <small role="alert">{rangeError}</small>}</form>
    </header>

    <div className={styles.statGrid} aria-label="Chỉ số tổng quan">
      <StatCard icon="✓" label="Tổng công việc" value={overview.summary.total_tasks} tone="blue" />
      <StatCard icon="◷" label="Đang thực hiện" value={overview.summary.in_progress_tasks} tone="amber" />
      <StatCard icon="◆" label="Đã phê duyệt" value={overview.summary.approved_tasks} tone="green" />
      <StatCard icon="!" label="Đang quá hạn" value={overview.summary.overdue_tasks} tone="red" />
      <StatCard icon="▧" label="Tài liệu được xem" value={overview.summary.visible_documents} tone="purple" />
      <StatCard icon="◌" label="Cảnh báo bảo mật" value={overview.summary.security_alerts} tone="teal" />
    </div>

    <div className={styles.quickLinks} aria-label="Truy cập nhanh"><strong>Đi tới</strong><Link href="/tasks">Công việc <span>→</span></Link><Link href="/documents">Tài liệu <span>→</span></Link><Link href="/grants">Quyền tài liệu <span>→</span></Link><Link href="/notifications">Thông báo <span>→</span></Link></div>

    <div className={styles.contentGrid}>
      <section className={styles.panel} aria-labelledby="status-title"><div className={styles.panelHeader}><div><p className={styles.panelEyebrow}>Theo trạng thái</p><h2 id="status-title">Tiến độ công việc</h2></div><Link href="/tasks">Mở danh sách <span>→</span></Link></div><div className={styles.statusList}>{statuses.map(status => <div className={styles.statusRow} key={status}><span className={`${styles.statusDot} ${styles[status.toLowerCase()]}`} /><span>{statusLabel(status)}</span><strong>{overview.task_status[status] ?? 0}</strong><div className={styles.statusTrack}><span style={{ width: `${overview.summary.total_tasks ? Math.min(100, ((overview.task_status[status] ?? 0) / overview.summary.total_tasks) * 100) : 0}%` }} /></div></div>)}</div></section>

      <section className={styles.panel} aria-labelledby="trend-title"><div className={styles.panelHeader}><div><p className={styles.panelEyebrow}>Trong 7 ngày gần nhất</p><h2 id="trend-title">Nhịp công việc</h2></div></div>{recentTrend.length === 0 ? <p className={styles.empty}>Chưa có dữ liệu xu hướng trong khoảng này.</p> : <div className={styles.trendList}>{recentTrend.map(item => <div className={styles.trendRow} key={item.date}><time>{displayDate(item.date)}</time><div><span className={styles.createdBar} style={{ width: `${(item.created / maxTrend) * 100}%` }} /><span className={styles.completedBar} style={{ width: `${(item.completed / maxTrend) * 100}%` }} /></div><small>{item.created} tạo · {item.completed} hoàn tất</small></div>)}</div>}<div className={styles.legend}><span><i className={styles.createdLegend} /> Tạo mới</span><span><i className={styles.completedLegend} /> Hoàn tất</span></div></section>

      <section className={styles.panel} aria-labelledby="activity-title"><div className={styles.panelHeader}><div><p className={styles.panelEyebrow}>Cập nhật mới nhất</p><h2 id="activity-title">Hoạt động gần đây</h2></div></div>{overview.recent_activity.length === 0 ? <p className={styles.empty}>Chưa có hoạt động trong khoảng này.</p> : <div className={styles.activityList}>{overview.recent_activity.slice(0, 6).map(item => <article key={item.id}><span className={styles.activityIcon}>•</span><div><strong>{item.message}</strong><small>{item.type.replaceAll('_', ' ')} · {displayDateTime(item.created_at)}</small></div></article>)}</div>}</section>

      <section className={styles.panel} aria-labelledby="documents-title"><div className={styles.panelHeader}><div><p className={styles.panelEyebrow}>Tài liệu &amp; quyền</p><h2 id="documents-title">Không gian tài liệu</h2></div><Link href="/documents">Mở tài liệu <span>→</span></Link></div><div className={styles.documentSummary}><div><span>Tài liệu có thể xem</span><strong>{overview.summary.visible_documents}</strong></div><div><span>Đang gắn với task</span><strong>{overview.summary.task_documents}</strong></div><div><span>Cảnh báo cần chú ý</span><strong>{overview.summary.security_alerts}</strong></div></div><p className={styles.helper}>Mọi số liệu được giới hạn theo quyền của phiên hiện tại.</p></section>
    </div>

    {overview.scope === 'ORGANIZATION' && overview.users && <section className={styles.adminPanel} aria-labelledby="organization-title"><div className={styles.panelHeader}><div><p className={styles.panelEyebrow}>Chỉ dành cho ADMIN</p><h2 id="organization-title">Toàn hệ thống</h2></div><span className={styles.secureBadge}>Không nhận user_id từ trình duyệt</span></div><div className={styles.adminGrid}><div><span>Người dùng</span><strong>{overview.users.total}</strong></div><div><span>Nhân viên đang hoạt động</span><strong>{overview.users.active_employees}</strong></div><div><span>Tài khoản bị khóa</span><strong>{overview.users.locked_users}</strong></div><div><span>Task toàn hệ thống</span><strong>{overview.organization_tasks?.total ?? overview.summary.total_tasks}</strong></div><div><span>Hồ sơ đủ điều kiện lưu giữ</span><strong>{overview.retention?.eligible_documents ?? 0}</strong></div><div><span>Audit chain</span><strong className={overview.security?.audit_chain === 'VALID' ? styles.valid : styles.invalid}>{overview.security?.audit_chain === 'VALID' ? 'Chuỗi audit hợp lệ' : 'Chuỗi audit không hợp lệ'}</strong></div></div></section>}
  </section>;
}
