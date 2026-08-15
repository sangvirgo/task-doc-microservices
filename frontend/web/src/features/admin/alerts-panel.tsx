'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from 'react';
import { adminApi } from '@/api/admin';
import { readSession } from '@/auth/session';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import type { SecurityAlert } from '@/types/admin';
import { dateKey, downloadCSV } from '@/lib/csv';
import styles from './admin.module.css';

const severityLabel: Record<string, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  CRITICAL: 'Nghiêm trọng',
};

const ruleTypeDetailLabel: Record<string, string> = {
  FAILED_LOGIN: 'Đăng nhập thất bại',
  DENIED_CONTENT_ACCESS: 'Truy cập tài liệu bị từ chối',
  RATE_LIMIT: 'Quá tải yêu cầu',
};

const alertDetailRows = (alert: SecurityAlert, emailOf: (id: string) => string): Array<[string, string]> => {
  const meta = alert.metadata ?? {};
  const rows: Array<[string, string]> = [];
  if (alert.actor_id) rows.push(['Nghi phạm (actor)', `${emailOf(alert.actor_id)} (${alert.actor_id})`]);
  if (typeof meta.count === 'number' && typeof meta.threshold === 'number') rows.push(['Số lần vượt ngưỡng', `${meta.count} / ${meta.threshold}`]);
  if (typeof meta.rule_type === 'string') rows.push(['Loại sự kiện', ruleTypeDetailLabel[meta.rule_type] ?? meta.rule_type]);
  if (typeof meta.window_start === 'string') rows.push(['Cửa sổ phát hiện', new Date(meta.window_start).toLocaleString('vi-VN')]);
  if (typeof meta.resource_id === 'string' && meta.resource_id) rows.push(['Tài nguyên bị nhắm tới', meta.resource_id]);
  if (typeof meta.action === 'string' && meta.action) rows.push(['Hành động bị từ chối', meta.action]);
  if (typeof meta.reason_code === 'string' && meta.reason_code) rows.push(['Lý do từ chối', meta.reason_code]);
  if (typeof meta.correlation_id === 'string' && meta.correlation_id) rows.push(['Mã tương quan', meta.correlation_id]);
  if (alert.status === 'RESOLVED') {
    if (alert.resolved_by) rows.push(['Xử lý bởi', `${emailOf(alert.resolved_by)} (${alert.resolved_by})`]);
    if (alert.resolved_at) rows.push(['Thời điểm xử lý', new Date(alert.resolved_at).toLocaleString('vi-VN')]);
  }
  return rows;
};

export function AlertsPanel() {
  const session = readSession();
  const [alerts, setAlerts] = useState<SecurityAlert[] | null>(null);
  const [directory, setDirectory] = useState<Array<{ id: string; email: string }> | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);

  const load = () => {
    setFailed(false);
    setAlerts(null);
    setDirectory(null);
    Promise.all([adminApi.alerts(), adminApi.allUsers()])
      .then(([nextAlerts, nextDirectory]) => { setAlerts(nextAlerts); setDirectory(nextDirectory); })
      .catch(() => setFailed(true));
  };

  useEffect(load, []);

  const emailOf = (id: string): string => directory?.find(member => member.id === id)?.email ?? 'Không xác định';

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (session?.role !== 'ADMIN') return <PermissionDeniedState />;
  if (failed) return <ErrorState message="Không thể tải dữ liệu cảnh báo." onRetry={load} />;
  if (!alerts || !directory) return <LoadingState />;

  const openAlerts = alerts.filter(alert => alert.status === 'OPEN').length;
  const resolvedAlerts = alerts.filter(alert => alert.status === 'RESOLVED').length;

  const exportAlerts = () => downloadCSV(`c17-security-alerts-${dateKey()}.csv`, [
    ['Mức độ', 'Mô tả', 'Trạng thái', 'Thời điểm phát hiện', 'Người xử lý', 'ID sự kiện'],
    ...alerts.map(alert => [
      severityLabel[alert.severity] ?? alert.severity,
      alert.description,
      alert.status === 'RESOLVED' ? 'Đã xử lý' : 'Đang mở',
      new Date(alert.created_at).toLocaleString('vi-VN'),
      alert.resolved_by ?? '',
      alert.id,
    ]),
  ]);

  const change = async (action: () => Promise<unknown>, successMessage: string) => {
    setStatus('Đang cập nhật…');
    try {
      await action();
      setStatus(successMessage);
      load();
    } catch {
      setStatus('Không thể cập nhật. Vui lòng thử lại.');
    }
  };

  return <section className={styles.adminPage}>
    <header className={styles.adminHero}>
      <div><span className={styles.heroEyebrow}>TRUNG TÂM AN TOÀN</span><h1>Cảnh báo</h1><p>Xem chi tiết các tín hiệu bất thường và xử lý theo từng trường hợp.</p></div>
      <div className={styles.heroActions}>
        <div ref={exportRef} className={styles.exportWrap}>
          <button className={styles.exportButton} type="button" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen(current => !current)}><span className={styles.exportIcon} aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></span>             Tải xuống dữ liệu kiểm toán</button>
          {exportOpen && <div className={styles.exportMenu} role="menu">
            <button type="button" role="menuitem" onClick={() => { exportAlerts(); setExportOpen(false); }}>Xuất cảnh báo (CSV)</button>
          </div>}
        </div>
        <div className={styles.heroStatus}><span>●</span><strong>Đang hoạt động</strong><small>Giám sát theo thời gian thực</small></div>
      </div>
    </header>

    <div className={styles.adminNotice}><span className={styles.noticeIcon}>i</span><div><strong>Phạm vi quản trị</strong><p>Chỉ quản trị viên mới có thể xem và xử lý các cảnh báo bảo mật.</p></div></div>

    <div className={styles.adminStats}>
      <article className={styles.adminStat}><span className={styles.statIconBlue}>◉</span><div><small>Cảnh báo đang mở</small><strong>{openAlerts}</strong><span>Cần được xem xét</span></div></article>
      <article className={styles.adminStat}><span className={styles.statIconGreen}>✓</span><div><small>Đã xử lý</small><strong>{resolvedAlerts}</strong><span>Đã xác nhận và đóng</span></div></article>
      <article className={styles.adminStat}><span className={styles.statIconPurple}>◐</span><div><small>Tổng cảnh báo</small><strong>{alerts.length}</strong><span>Toàn bộ lịch sử</span></div></article>
    </div>

    {status && <p className={styles.adminStatus} role="status">{status}</p>}

    <section className={styles.adminPanel + ' ' + styles.alertPanel}>
      <div className={styles.panelHeader}><div><span className={styles.panelEyebrow}>CẦN CHÚ Ý</span><h2>Cảnh báo gần đây</h2></div><span className={styles.countBadge}>{alerts.length}</span></div>
      {alerts.length === 0 ? <EmptyState title="Không có cảnh báo">Hệ thống chưa ghi nhận cảnh báo nào.</EmptyState> : <div className={styles.alertList}>{alerts.map(alert => { const detailRows = alertDetailRows(alert, emailOf); const expanded = expandedAlertId === alert.id; return <article className={styles.alertRow} key={alert.id}><span className={styles.alertSeverity}>{severityLabel[alert.severity] ?? alert.severity}</span><div className={styles.alertCopy}><strong>{alert.description}</strong><small>Phát hiện lúc {new Date(alert.created_at).toLocaleString('vi-VN')}</small></div><span className={alert.status === 'RESOLVED' ? styles.resolvedChip : styles.openChip}>{alert.status === 'RESOLVED' ? 'Đã xử lý' : 'Đang mở'}</span>{alert.status !== 'RESOLVED' && <button className={styles.resolveAction} type="button" onClick={() => void change(() => adminApi.resolveAlert(alert.id, session?.userId ?? ''), 'Đã xử lý cảnh báo.')}>Xử lý</button>}{detailRows.length > 0 && <button className={styles.detailToggle} type="button" aria-expanded={expanded} onClick={() => setExpandedAlertId(expanded ? null : alert.id)}>{expanded ? 'Thu gọn' : 'Chi tiết'}</button>}{expanded && detailRows.length > 0 && <div className={styles.alertDetail}><dl>{detailRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><code>{value}</code></dd></div>)}</dl></div>}</article>; })}</div>}
    </section>
  </section>;
}