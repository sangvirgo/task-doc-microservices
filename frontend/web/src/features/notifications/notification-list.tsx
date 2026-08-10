'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { ChangeEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { notificationsApi } from '@/api/notifications';
import { readSession } from '@/auth/session';
import { ErrorState, LoadingState } from '@/components/common-states';
import type { Notification, NotificationPreference } from '@/types/notification';
import styles from './notifications.module.css';

type NotificationTone = 'danger' | 'success' | 'purple' | 'info' | 'teal';

function presentation(type: string): { tone: NotificationTone; icon: string; label: string } {
  const normalized = type.toLowerCase();
  if (/security|session|revoke|lock|alert/.test(normalized)) return { tone: 'danger', icon: '!', label: 'Security' };
  if (/password|account|auth|login/.test(normalized)) return { tone: 'purple', icon: '⌁', label: 'Account' };
  if (/document|file|grant|share/.test(normalized)) return { tone: 'info', icon: '▧', label: 'Documents' };
  if (/task|approve|complete|success/.test(normalized)) return { tone: 'success', icon: '✓', label: 'Workflow' };
  return { tone: 'teal', icon: '◌', label: type.replaceAll('_', ' ') };
}

export function NotificationList() {
  const session = readSession();
  const userId = session?.userId;
  const [items, setItems] = useState<Notification[] | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => {
    if (!userId) return;
    setItems(null);
    setError(false);
    Promise.all([notificationsApi.list(userId, unreadOnly), notificationsApi.preferences(userId)])
      .then(([listed, prefs]) => { setItems(listed); setPreferences(prefs); })
      .catch(() => setError(true));
  };
  useEffect(load, [userId, unreadOnly]);

  if (!userId) return <ErrorState message="A session identity hint is unavailable. Please sign in again." />;

  const markRead = async (id: string) => {
    try {
      const updated = await notificationsApi.markRead(id);
      setItems(current => current?.map(item => item.id === id ? updated : item) ?? null);
      setMessage('Đã đánh dấu thông báo là đã đọc.');
    } catch { setMessage('Máy chủ chưa chấp nhận cập nhật trạng thái đọc.'); }
  };
  const markAll = async () => {
    try {
      const result = await notificationsApi.markAllRead(userId);
      setItems(current => current?.map(item => item.read_at ? item : { ...item, read_at: new Date().toISOString() }) ?? null);
      setMessage(`Đã đánh dấu ${result.count} thông báo là đã đọc.`);
    } catch { setMessage('Máy chủ chưa chấp nhận thao tác đánh dấu tất cả.'); }
  };
  const changePreference = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!preferences) return;
    const next = { ...preferences, [event.target.name]: event.target.checked };
    setPreferences(next);
    try {
      const updated = await notificationsApi.updatePreferences(userId, { email_enabled: next.email_enabled, in_app_enabled: next.in_app_enabled });
      setPreferences(updated);
      setMessage('Đã cập nhật cách nhận thông báo.');
    } catch {
      setPreferences(preferences);
      setMessage('Máy chủ chưa chấp nhận thay đổi tùy chọn thông báo.');
    }
  };

  if (error) return <ErrorState message="Notifications could not be loaded." onRetry={load} />;
  if (!items || !preferences) return <LoadingState />;
  const unreadCount = items.filter(item => item.read_at === null).length;

  return <section className={styles.page}>
    <header className={styles.pageHeader}>
      <div><div className={styles.titleRow}><h1>Thông báo</h1>{unreadCount > 0 && <span>{unreadCount} mới</span>}</div><p>Theo dõi hoạt động bảo mật và cập nhật từ không gian làm việc.</p></div>
      <div className={styles.headerControls}>
        <div className={styles.segmented} role="group" aria-label="Lọc thông báo"><button type="button" className={!unreadOnly ? styles.active : ''} aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>Tất cả</button><button type="button" className={unreadOnly ? styles.active : ''} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>Chưa đọc</button></div>
        <button className={styles.markAll} type="button" onClick={markAll} disabled={unreadCount === 0}><span aria-hidden="true">✓✓</span> Đánh dấu tất cả đã đọc</button>
      </div>
    </header>
    {message && <p className={styles.feedback} role="status"><span aria-hidden="true">✓</span>{message}</p>}
    <section className={styles.inbox} aria-label="Danh sách thông báo">
      {items.length === 0 ? <div className={styles.empty}><span aria-hidden="true">◌</span><h2>No notifications</h2><p>{unreadOnly ? 'Không còn thông báo chưa đọc.' : 'Thông báo dành cho phiên làm việc này sẽ xuất hiện tại đây.'}</p></div> : <ul className={styles.list}>
        {items.map(item => { const visual = presentation(item.type); const unread = item.read_at === null; return <li className={`${styles.item} ${unread ? styles.unread : ''}`} key={item.id}><span className={`${styles.eventIcon} ${styles[visual.tone]}`} aria-hidden="true">{visual.icon}</span><div className={styles.itemContent}><Link className={styles.itemLink} href={`/notifications/${item.id}`}><div className={styles.itemHeading}><h2>{item.title}</h2><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('vi-VN')}</time></div><p>{item.body}</p></Link><div className={styles.itemFooter}><span className={`${styles.typeChip} ${styles[visual.tone]}`}>{visual.label}</span>{unread && <button type="button" onClick={() => markRead(item.id)}><span aria-hidden="true">✓</span> Đánh dấu đã đọc</button>}</div></div>{unread && <span className={styles.unreadDot} aria-label="Chưa đọc" />}</li>; })}
      </ul>}
    </section>
    <section className={styles.preferences} aria-labelledby="preferences-title">
      <div className={styles.preferencesTitle}><span aria-hidden="true">⚙</span><div><h2 id="preferences-title">Cấu hình nhận thông báo</h2><p>Chọn kênh bạn muốn sử dụng để nhận các cập nhật quan trọng.</p></div></div>
      <div className={styles.preferenceGrid}><div className={styles.preferenceRow}><label htmlFor="toggle-in-app"><strong>Thông báo trong ứng dụng</strong><span>Hiển thị cập nhật ngay trong không gian làm việc.</span></label><input className={styles.switch} id="toggle-in-app" type="checkbox" name="in_app_enabled" checked={preferences.in_app_enabled} onChange={changePreference} /></div><div className={styles.preferenceRow}><label htmlFor="toggle-email"><strong>Thông báo qua email</strong><span>Gửi tóm tắt hoạt động quan trọng về hòm thư đăng ký.</span></label><input className={styles.switch} id="toggle-email" type="checkbox" name="email_enabled" checked={preferences.email_enabled} onChange={changePreference} /></div></div>
    </section>
  </section>;
}
