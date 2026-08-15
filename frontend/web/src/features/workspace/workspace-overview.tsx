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
type ActivityTone = 'blocked' | 'assigned' | 'approved' | 'review' | 'comment' | 'submission' | 'updated' | 'default';
const activityPresentation = (type: string): { icon: string; label: string; hint: string; tone: ActivityTone } => {
  const map: Record<string, { icon: string; label: string; hint: string; tone: ActivityTone }> = {
    BLOCKED: { icon: '!', label: 'BỊ CHẶN', hint: 'Công việc đang bị tạm dừng chờ xử lý.', tone: 'blocked' },
    UNBLOCKED: { icon: '✓', label: 'GỠ CHẶN', hint: 'Công việc đã được gỡ chặn và tiếp tục thực hiện.', tone: 'approved' },
    ASSIGNMENT: { icon: '→', label: 'GIAO VIỆC', hint: 'Công việc đã được giao cho người phụ trách.', tone: 'assigned' },
    REVIEWER_ASSIGNED: { icon: '✎', label: 'GIAO DUYỆT', hint: 'Người phê duyệt đã được chỉ định cho công việc.', tone: 'review' },
    COMMENT: { icon: '✎', label: 'BÌNH LUẬN', hint: 'Có bình luận mới trên công việc.', tone: 'comment' },
    SUBMISSION: { icon: '↑', label: 'NỘP KẾT QUẢ', hint: 'Kết quả công việc đã được gửi để phê duyệt.', tone: 'submission' },
    REVIEW_DECISION: { icon: '✓', label: 'DUYỆT KẾT QUẢ', hint: 'Người phê duyệt đã đưa ra quyết định cho công việc.', tone: 'approved' },
    STATUS_CHANGE: { icon: '↻', label: 'ĐỔI TRẠNG THÁI', hint: 'Trạng thái của công việc vừa được cập nhật.', tone: 'updated' },
    TASK_UPDATED: { icon: '✎', label: 'CẬP NHẬT', hint: 'Thông tin công việc vừa được chỉnh sửa.', tone: 'updated' },
  };
  return map[type.toUpperCase()] ?? { icon: '•', label: type.replaceAll('_', ' '), hint: 'Cập nhật mới trong không gian làm việc.', tone: 'default' };
};
const formatActivityMessage = (message: string): string => {
  const value = message.trim();
  const statusMatch = value.match(/^Status changed from\s+(.+?)\s+to\s+(.+?)$/i);
  if (statusMatch) return `Đổi trạng thái từ ${statusLabel(statusMatch[1])} sang ${statusLabel(statusMatch[2])}`;
  const commentMatch = value.match(/^Comment added:\s*(.+)$/i);
  if (commentMatch) return `Đã thêm bình luận: ${commentMatch[1]}`;
  if (/^Task result submitted for review$/i.test(value)) return 'Kết quả công việc đã được gửi để phê duyệt';
  const reviewMatch = value.match(/^Submission\s+(.+)$/i);
  if (reviewMatch) {
    const decision = reviewMatch[1].trim().toUpperCase();
    const decisionLabel: Record<string, string> = { APPROVED: 'đã phê duyệt', NEED_REVISION: 'cần chỉnh sửa', REJECTED: 'đã từ chối' };
    return `Kết quả nộp: ${decisionLabel[decision] ?? reviewMatch[1]}`;
  }
  const assignedMatch = value.match(/^Task assigned to\s+(.+)$/i);
  if (assignedMatch) return `Đã giao công việc cho ${assignedMatch[1]}`;
  const reviewerMatch = value.match(/^Task reviewer assigned to\s+(.+)$/i);
  if (reviewerMatch) return `Người phê duyệt: ${reviewerMatch[1]}`;
  const blockedMatch = value.match(/^Task blocked:\s*(.+)$/i);
  if (blockedMatch) return `Công việc bị chặn: ${blockedMatch[1]}`;
  if (/^Task unblocked$/i.test(value)) return 'Công việc đã được gỡ chặn';
  if (/^Task metadata updated$/i.test(value)) return 'Thông tin công việc đã được cập nhật';
  return value;
};

function StatCard({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return <article className={styles.statCard}><span className={`${styles.statIcon} ${styles[tone]}`} aria-hidden="true">{icon}</span><div><span>{label}</span><strong>{value}</strong></div></article>;
}

export function WorkspaceOverview() {
  const session = readSession();
  const isAdmin = session?.role === 'ADMIN';
  const scope: StatisticsScope = isAdmin ? 'ORGANIZATION' : 'ME';
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
  const maxGrowth = Math.max(1, ...(overview.growth_trend ?? []).flatMap(item => [item.users, item.tasks]));
  const recentGrowth = (overview.growth_trend ?? []).slice(-7);
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

    {isAdmin ? <div className={styles.contentGrid}>
      <section className={styles.panel} aria-labelledby="growth-title"><div className={styles.panelHeader}><div><p className={styles.panelEyebrow}>Trong 7 ngày gần nhất</p><h2 id="growth-title">Tăng trưởng hệ thống</h2></div></div>{recentGrowth.length === 0 ? <p className={styles.empty}>Chưa có dữ liệu tăng trưởng trong khoảng này.</p> : <div className={styles.trendList}>{recentGrowth.map(item => <div className={styles.trendRow} key={item.date}><time>{displayDate(item.date)}</time><div><span className={styles.createdBar} style={{ width: `${(item.users / maxGrowth) * 100}%` }} /><span className={styles.completedBar} style={{ width: `${(item.tasks / maxGrowth) * 100}%` }} /></div><small>{item.users} người · {item.tasks} việc</small></div>)}</div>}<div className={styles.legend}><span><i className={styles.createdLegend} /> Người dùng</span><span><i className={styles.completedLegend} /> Công việc</span></div></section>
    </div> : <div className={styles.contentGrid}>
      <section className={styles.panel} aria-labelledby="status-title"><div className={styles.panelHeader}><div><p className={styles.panelEyebrow}>Theo trạng thái</p><h2 id="status-title">Tiến độ công việc</h2></div><Link href="/tasks">Mở danh sách <span>→</span></Link></div><div className={styles.statusList}>{statuses.map(status => <div className={styles.statusRow} key={status}><span className={`${styles.statusDot} ${styles[status.toLowerCase()]}`} /><span>{statusLabel(status)}</span><strong>{overview.task_status[status] ?? 0}</strong><div className={styles.statusTrack}><span style={{ width: `${overview.summary.total_tasks ? Math.min(100, ((overview.task_status[status] ?? 0) / overview.summary.total_tasks) * 100) : 0}%` }} /></div></div>)}</div></section>

      <section className={styles.panel} aria-labelledby="trend-title"><div className={styles.panelHeader}><div><p className={styles.panelEyebrow}>Trong 7 ngày gần nhất</p><h2 id="trend-title">Nhịp công việc</h2></div></div>{recentTrend.length === 0 ? <p className={styles.empty}>Chưa có dữ liệu xu hướng trong khoảng này.</p> : <div className={styles.trendList}>{recentTrend.map(item => <div className={styles.trendRow} key={item.date}><time>{displayDate(item.date)}</time><div><span className={styles.createdBar} style={{ width: `${(item.created / maxTrend) * 100}%` }} /><span className={styles.completedBar} style={{ width: `${(item.completed / maxTrend) * 100}%` }} /></div><small>{item.created} tạo · {item.completed} hoàn tất</small></div>)}</div>}<div className={styles.legend}><span><i className={styles.createdLegend} /> Tạo mới</span><span><i className={styles.completedLegend} /> Hoàn tất</span></div></section>

      <section className={styles.panel} aria-labelledby="activity-title"><div className={styles.panelHeader}><div><p className={styles.panelEyebrow}>Cập nhật mới nhất</p><h2 id="activity-title">Hoạt động gần đây</h2></div></div>{overview.recent_activity.length === 0 ? <p className={styles.empty}>Chưa có hoạt động trong khoảng này.</p> : <div className={styles.activityList}>{overview.recent_activity.slice(0, 6).map(item => { const activity = activityPresentation(item.type); return <article className={styles.activityItem} key={item.id}><span className={`${styles.activityIcon} ${styles[activity.tone]}`} aria-hidden="true">{activity.icon}</span><div className={styles.activityContent}><div className={styles.activityTitleRow}><strong>{formatActivityMessage(item.message)}</strong><span className={`${styles.activityStatus} ${styles[activity.tone]}`}>{activity.label}</span></div><p className={styles.activityHint}>{activity.hint}</p><small className={styles.activityTime}>{displayDateTime(item.created_at)}</small></div></article>; })}</div>}</section>

      <section className={styles.panel} aria-labelledby="documents-title"><div className={styles.panelHeader}><div><p className={styles.panelEyebrow}>Tài liệu &amp; quyền</p><h2 id="documents-title">Không gian tài liệu</h2></div><Link href="/documents">Mở tài liệu <span>→</span></Link></div><div className={styles.documentSummary}><div><span>Tài liệu có thể xem</span><strong>{overview.summary.visible_documents}</strong></div><div><span>Đang gắn với task</span><strong>{overview.summary.task_documents}</strong></div><div><span>Cảnh báo cần chú ý</span><strong>{overview.summary.security_alerts}</strong></div></div><p className={styles.helper}>Mọi số liệu được giới hạn theo quyền của phiên hiện tại.</p></section>
    </div>}

    {overview.scope === 'ORGANIZATION' && overview.users && <section className={styles.adminPanel} aria-labelledby="organization-title"><div className={styles.panelHeader}><div><p className={styles.panelEyebrow}>Chỉ dành cho ADMIN</p><h2 id="organization-title">Toàn hệ thống</h2></div><span className={styles.secureBadge}>Không nhận user_id từ trình duyệt</span></div><div className={styles.adminGrid}><div><span>Người dùng</span><strong>{overview.users.total}</strong></div><div><span>Nhân viên đang hoạt động</span><strong>{overview.users.active_employees}</strong></div><div><span>Tài khoản bị khóa</span><strong>{overview.users.locked_users}</strong></div><div><span>Task toàn hệ thống</span><strong>{overview.organization_tasks?.total ?? overview.summary.total_tasks}</strong></div><div><span>Hồ sơ đủ điều kiện lưu giữ</span><strong>{overview.retention?.eligible_documents ?? 0}</strong></div><div><span>Audit chain</span><strong className={overview.security?.audit_chain === 'VALID' ? styles.valid : styles.invalid}>{overview.security?.audit_chain === 'VALID' ? 'Chuỗi audit hợp lệ' : 'Chuỗi audit không hợp lệ'}</strong></div></div></section>}
  </section>;
}
