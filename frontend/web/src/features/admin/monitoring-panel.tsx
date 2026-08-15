'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { adminApi } from '@/api/admin';
import { readSession } from '@/auth/session';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import type { SecurityAlert, SecurityRule } from '@/types/admin';
import { SearchableSelect } from '@/components/searchable-select';
import { dateKey, downloadCSV } from '@/lib/csv';
import styles from './admin.module.css';

const ruleTypeLabel: Record<string, string> = {
  FAILED_LOGIN: 'Đăng nhập thất bại',
  EXCESSIVE_PERMISSION_CHECKS: 'Kiểm tra quyền bất thường',
};

const severityLabel: Record<string, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  CRITICAL: 'Nghiêm trọng',
};

export function MonitoringPanel() {
  const session = readSession();
  const [alerts, setAlerts] = useState<SecurityAlert[] | null>(null);
  const [rules, setRules] = useState<SecurityRule[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setFailed(false);
    setAlerts(null);
    setRules(null);
    Promise.all([adminApi.alerts(), adminApi.rules()])
      .then(([nextAlerts, nextRules]) => { setAlerts(nextAlerts); setRules(nextRules); })
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

  if (session?.role !== 'ADMIN') return <PermissionDeniedState />;
  if (failed) return <ErrorState message="Không thể tải dữ liệu giám sát." onRetry={load} />;
  if (!alerts || !rules) return <LoadingState />;

  const exportAlerts = () => downloadCSV(`c17-monitoring-alerts-${dateKey()}.csv`, [
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

  const exportRules = () => downloadCSV(`c17-monitoring-rules-${dateKey()}.csv`, [
    ['Tên quy tắc', 'Loại sự kiện', 'Ngưỡng', 'Cửa sổ (phút)', 'Hành động', 'Trạng thái', 'ID quy tắc'],
    ...rules.map(rule => [
      rule.name,
      ruleTypeLabel[rule.rule_type] ?? rule.rule_type,
      rule.threshold,
      rule.window_minutes,
      rule.action === 'BLOCK' ? 'Chặn truy cập' : 'Ghi nhận cảnh báo',
      rule.enabled ? 'Đang bật' : 'Đã tắt',
      rule.id,
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

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return change(() => adminApi.createRule({
      name: String(form.get('name')),
      description: String(form.get('description')) || undefined,
      rule_type: String(form.get('rule_type')),
      threshold: Number(form.get('threshold')),
      window_minutes: Number(form.get('window_minutes')),
      action: String(form.get('action')) as 'ALERT' | 'BLOCK',
    }), 'Đã tạo quy tắc giám sát.');
  };

  const openAlerts = alerts.filter(alert => alert.status === 'OPEN').length;
  const enabledRules = rules.filter(rule => rule.enabled).length;
  const blockRules = rules.filter(rule => rule.action === 'BLOCK').length;

  return <section className={styles.adminPage}>
    <header className={styles.adminHero}>
      <div><span className={styles.heroEyebrow}>TRUNG TÂM AN TOÀN</span><h1>Giám sát hệ thống</h1><p>Theo dõi cảnh báo, điều chỉnh quy tắc và xử lý các tín hiệu bất thường.</p></div>
      <div className={styles.heroActions}>
        <div ref={exportRef} className={styles.exportWrap}>
          <button className={styles.exportButton} type="button" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen(current => !current)}><span className={styles.exportIcon} aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></span> Tải xuống</button>
          {exportOpen && <div className={styles.exportMenu} role="menu">
            <button type="button" role="menuitem" onClick={() => { exportAlerts(); setExportOpen(false); }}>Xuất cảnh báo (CSV)</button>
            <button type="button" role="menuitem" onClick={() => { exportRules(); setExportOpen(false); }}>Xuất quy tắc (CSV)</button>
          </div>}
        </div>
        <div className={styles.heroStatus}><span>●</span><strong>Đang hoạt động</strong><small>Giám sát theo thời gian thực</small></div>
      </div>
    </header>

    <div className={styles.adminNotice}><span className={styles.noticeIcon}>i</span><div><strong>Phạm vi quản trị</strong><p>Chỉ quản trị viên mới có thể xem và thay đổi các quy tắc bảo mật.</p></div></div>

    <div className={styles.adminStats}>
      <article className={styles.adminStat}><span className={styles.statIconBlue}>◉</span><div><small>Cảnh báo đang mở</small><strong>{openAlerts}</strong><span>Cần được xem xét</span></div></article>
      <article className={styles.adminStat}><span className={styles.statIconGreen}>✓</span><div><small>Quy tắc đang bật</small><strong>{enabledRules}</strong><span>Đang bảo vệ hệ thống</span></div></article>
      <article className={styles.adminStat}><span className={styles.statIconPurple}>◆</span><div><small>Quy tắc chặn</small><strong>{blockRules}</strong><span>Phản ứng tự động</span></div></article>
    </div>

    <div className={styles.monitoringGrid}>
      <section className={styles.adminPanel}>
        <div className={styles.panelHeader}><div><span className={styles.panelEyebrow}>THIẾT LẬP</span><h2>Tạo quy tắc mới</h2></div><span className={styles.panelHint}>Tự động phát hiện rủi ro</span></div>
        <form className={styles.adminForm} onSubmit={create}>
          <label>Tên quy tắc<input name="name" placeholder="Ví dụ: Đăng nhập thất bại liên tiếp" required /></label>
          <label>Loại sự kiện<input name="rule_type" placeholder="Ví dụ: FAILED_LOGIN" required /></label>
          <div className={styles.formRow}><label>Ngưỡng<input name="threshold" type="number" min="1" defaultValue="5" required /></label><label>Cửa sổ thời gian<input name="window_minutes" type="number" min="1" defaultValue="15" required /></label></div>
          <label>Hành động<SearchableSelect name="action" defaultValue="ALERT"><option value="ALERT">Ghi nhận cảnh báo</option><option value="BLOCK">Chặn truy cập</option></SearchableSelect></label>
          <label>Mô tả <span>Tùy chọn</span><textarea name="description" rows={3} placeholder="Mô tả khi nào quy tắc này được áp dụng…" /></label>
          <button className={styles.primaryAction} type="submit">+ Tạo quy tắc</button>
        </form>
      </section>

      <section className={styles.adminPanel}>
        <div className={styles.panelHeader}><div><span className={styles.panelEyebrow}>ĐANG ÁP DỤNG</span><h2>Quy tắc bảo mật</h2></div><span className={styles.countBadge}>{rules.length}</span></div>
        {rules.length === 0 ? <EmptyState title="Chưa có quy tắc">Tạo quy tắc đầu tiên để bắt đầu theo dõi.</EmptyState> : <div className={styles.ruleList}>{rules.map(rule => <article className={styles.ruleRow} key={rule.id}><span className={styles.ruleIcon}>{rule.action === 'BLOCK' ? '!' : '◉'}</span><div><strong>{rule.name}</strong><small>{ruleTypeLabel[rule.rule_type] ?? rule.rule_type} · Ngưỡng {rule.threshold} trong {rule.window_minutes} phút</small></div><div className={styles.ruleActions}><span className={rule.enabled ? styles.enabledChip : styles.disabledChip}>{rule.enabled ? 'Đang bật' : 'Đã tắt'}</span><button type="button" onClick={() => void change(() => adminApi.toggleRule(rule.id, !rule.enabled), rule.enabled ? 'Đã tắt quy tắc.' : 'Đã bật quy tắc.')}>{rule.enabled ? 'Tắt' : 'Bật'}</button></div></article>)}</div>}
      </section>
    </div>

    {status && <p className={styles.adminStatus} role="status">{status}</p>}

    <section className={styles.adminPanel + ' ' + styles.alertPanel}>
      <div className={styles.panelHeader}><div><span className={styles.panelEyebrow}>CẦN CHÚ Ý</span><h2>Cảnh báo gần đây</h2></div><span className={styles.countBadge}>{alerts.length}</span></div>
      {alerts.length === 0 ? <EmptyState title="Không có cảnh báo">Hệ thống chưa ghi nhận cảnh báo nào.</EmptyState> : <div className={styles.alertList}>{alerts.map(alert => <article className={styles.alertRow} key={alert.id}><span className={styles.alertSeverity}>{severityLabel[alert.severity] ?? alert.severity}</span><div className={styles.alertCopy}><strong>{alert.description}</strong><small>Phát hiện lúc {new Date(alert.created_at).toLocaleString('vi-VN')}</small></div><span className={alert.status === 'RESOLVED' ? styles.resolvedChip : styles.openChip}>{alert.status === 'RESOLVED' ? 'Đã xử lý' : 'Đang mở'}</span>{alert.status !== 'RESOLVED' && <button className={styles.resolveAction} type="button" onClick={() => void change(() => adminApi.resolveAlert(alert.id, session?.userId ?? ''), 'Đã xử lý cảnh báo.')}>Xử lý</button>}</article>)}</div>}
    </section>
  </section>;
}
