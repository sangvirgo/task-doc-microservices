'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { notificationsApi } from '@/api/notifications';
import type { Notification } from '@/types/notification';
import { ErrorState, LoadingState } from '@/components/common-states';
import styles from './notification-detail.module.css';

const label = (key: string) => key.replaceAll('_', ' ').replace(/\b\w/g, value => value.toUpperCase());
const displayValue = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value);

export function NotificationDetail({ id }: { id: string }) {
  const [item, setItem] = useState<Notification | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    setItem(null);
    setError(false);
    notificationsApi.get(id).then(result => {
      setItem(result);
      if (!result.read_at) void notificationsApi.markRead(id).catch(() => undefined);
    }).catch(() => setError(true));
  };
  useEffect(load, [id]);

  if (error) return <ErrorState message="Không thể tải chi tiết thông báo." onRetry={load} />;
  if (!item) return <LoadingState />;

  const localizedTitle = item.type === 'TASK_ASSIGNED' ? 'Được giao công việc' : item.type === 'SECURITY_SESSION_REVOKED' ? 'Phiên đăng nhập đã bị thu hồi' : item.type === 'SECURITY_ALERT' ? 'Cảnh báo an toàn' : item.type === 'GRANT_EXPIRED' ? 'Quyền truy cập tài liệu đã hết hạn' : item.type === 'TASK_SUBMITTED_FOR_REVIEW' ? 'Submission đang chờ phê duyệt' : item.type === 'TASK_REVIEWED' ? 'Kết quả submission đã được cập nhật' : item.type === 'TASK_DEADLINE_REMINDER' ? 'Công việc sắp đến hạn' : item.title;
  const localizedBody = item.type === 'TASK_ASSIGNED' ? 'Bạn được giao một công việc mới.' : item.type === 'SECURITY_SESSION_REVOKED' ? 'Phiên đăng nhập của bạn đã bị thu hồi vì lý do bảo mật.' : item.type === 'SECURITY_ALERT' ? 'Hệ thống phát hiện một cảnh báo an toàn liên quan đến hoạt động tài khoản.' : item.type === 'GRANT_EXPIRED' ? 'Một quyền truy cập tài liệu đã hết hạn.' : item.type === 'TASK_SUBMITTED_FOR_REVIEW' ? 'Một submission công việc đang chờ bạn phê duyệt.' : item.type === 'TASK_REVIEWED' ? 'Submission của bạn đã được người review xử lý.' : item.type === 'TASK_DEADLINE_REMINDER' ? 'Một công việc bạn phụ trách sắp đến hạn.' : item.body;
  const taskId = typeof item.metadata?.task_id === 'string' ? item.metadata.task_id : null;
  const metadata = Object.entries(item.metadata ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== '');
  return <section className={styles.page}>
    <Link className={styles.backLink} href="/notifications">← Quay lại thông báo</Link>
    <article className={styles.card}>
      <header className={styles.header}><div><p className={styles.eyebrow}>Chi tiết thông báo</p><h1>{localizedTitle}</h1><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('vi-VN')}</time></div><span className={item.read_at ? styles.read : styles.unread}>{item.read_at ? 'Đã đọc' : 'Chưa đọc'}</span></header>
      <div className={styles.body}><p>{localizedBody}</p></div>
      {taskId && <Link className={styles.primaryLink} href={`/tasks/${taskId}`}>Mở task liên quan <span aria-hidden="true">→</span></Link>}
      {metadata.length > 0 && <dl className={styles.metadata}>{metadata.map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{displayValue(value)}</dd></div>)}</dl>}
    </article>
  </section>;
}
