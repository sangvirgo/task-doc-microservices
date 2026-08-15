'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { adminApi } from '@/api/admin';
import { readSession } from '@/auth/session';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import type { SecurityRule } from '@/types/admin';
import { dateKey, downloadCSV } from '@/lib/csv';
import styles from './admin.module.css';

const ruleTypeOptions: Array<{ value: string; label: string }> = [
  { value: 'FAILED_LOGIN', label: 'Đăng nhập thất bại' },
  { value: 'DENIED_CONTENT_ACCESS', label: 'Truy cập tài liệu bị từ chối' },
];
const ruleTypeLabel: Record<string, string> = Object.fromEntries(ruleTypeOptions.map(option => [option.value, option.label]));

export function MonitoringPanel() {
  const session = readSession();
  const [rules, setRules] = useState<SecurityRule[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setFailed(false);
    setRules(null);
    adminApi.rules().then(setRules).catch(() => setFailed(true));
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
  if (!rules) return <LoadingState />;

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

  const enabledRules = rules.filter(rule => rule.enabled).length;
  const blockRules = rules.filter(rule => rule.action === 'BLOCK').length;

  return <section className={styles.adminPage}>
    <header className={styles.adminHero}>
      <div><span className={styles.heroEyebrow}>TRUNG TÂM AN TOÀN</span><h1>Giám sát hệ thống</h1><p>Điều chỉnh quy tắc phát hiện và kiểm soát cách hệ thống phản ứng với hành vi bất thường.</p></div>
      <div className={styles.heroActions}>
        <div ref={exportRef} className={styles.exportWrap}>
          <button className={styles.exportButton} type="button" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen(current => !current)}><span className={styles.exportIcon} aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></span>             Tải xuống dữ liệu giám sát</button>
          {exportOpen && <div className={styles.exportMenu} role="menu">
            <button type="button" role="menuitem" onClick={() => { exportRules(); setExportOpen(false); }}>Xuất quy tắc (CSV)</button>
          </div>}
        </div>
        <div className={styles.heroStatus}><span>●</span><strong>Đang hoạt động</strong><small>Giám sát theo thời gian thực</small></div>
      </div>
    </header>

    <div className={styles.adminNotice}><span className={styles.noticeIcon}>i</span><div><strong>Phạm vi quản trị</strong><p>Chỉ quản trị viên mới có thể xem và thay đổi các quy tắc bảo mật.</p></div></div>

    <div className={styles.adminStats}>
      <article className={styles.adminStat}><span className={styles.statIconGreen}>✓</span><div><small>Quy tắc đang bật</small><strong>{enabledRules}</strong><span>Đang bảo vệ hệ thống</span></div></article>
      <article className={styles.adminStat}><span className={styles.statIconPurple}>◆</span><div><small>Quy tắc chặn</small><strong>{blockRules}</strong><span>Phản ứng tự động</span></div></article>
      <article className={styles.adminStat}><span className={styles.statIconBlue}>◉</span><div><small>Tổng quy tắc</small><strong>{rules.length}</strong><span>Đã thiết lập</span></div></article>
    </div>

    <div className={styles.monitoringGrid}>
      <section className={styles.adminPanel}>
        <div className={styles.panelHeader}><div><span className={styles.panelEyebrow}>THIẾT LẬP</span><h2>Tạo quy tắc mới</h2></div><span className={styles.panelHint}>Tự động phát hiện rủi ro</span></div>
        <form className={styles.adminForm} onSubmit={create}>
          <label>Tên quy tắc<input name="name" placeholder="Ví dụ: Đăng nhập thất bại liên tiếp" required /></label>
          <label>Loại sự kiện<select name="rule_type" defaultValue="FAILED_LOGIN">{ruleTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <div className={styles.formRow}><label>Ngưỡng<input name="threshold" type="number" min="1" defaultValue="5" required /></label><label>Cửa sổ thời gian<input name="window_minutes" type="number" min="1" defaultValue="15" required /></label></div>
          <label>Hành động<select name="action" defaultValue="ALERT"><option value="ALERT">Ghi nhận cảnh báo</option><option value="BLOCK">Chặn truy cập</option></select></label>
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
  </section>;
}
