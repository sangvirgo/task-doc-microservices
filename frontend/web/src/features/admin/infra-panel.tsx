'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from 'react';
import { infraApi, type InfraStatus } from '@/api/infra';
import { readSession } from '@/auth/session';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import styles from './admin.module.css';

const formatBytes = (bytes: number): string => {
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(2)} GB`;
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MB`;
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(1)} KB`;
  return `${bytes} B`;
};

const formatCount = (value: number): string =>
  value >= 1000 ? value.toLocaleString('vi-VN') : String(value);

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'medium' });

const mergeBucketStats = (status: InfraStatus | null) => {
  const buckets = status?.minio.buckets ?? [];
  const merged = new Map<string, { objects: number; bytes: number }>();
  for (const bucket of buckets) {
    const current = merged.get(bucket.name);
    merged.set(bucket.name, current ? {
      objects: current.objects + bucket.objects,
      bytes: current.bytes + bucket.bytes,
    } : { objects: bucket.objects, bytes: bucket.bytes });
  }
  return Array.from(merged.entries()).sort((a, b) => b[1].bytes - a[1].bytes);
};

export function InfraPanel() {
  const session = readSession();
  const [status, setStatus] = useState<InfraStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setFailed(false);
    setStatus(null);
    infraApi.status().then(setStatus).catch(() => setFailed(true));
  };

  useEffect(load, []);

  const refresh = () => {
    setRefreshing(true);
    infraApi.status().then(setStatus).catch(() => setFailed(true)).finally(() => setRefreshing(false));
  };

  if (session?.role !== 'ADMIN') return <PermissionDeniedState />;
  if (failed) return <ErrorState message="Không thể tải thông tin hạ tầng." onRetry={load} />;
  if (!status) return <LoadingState />;

  const { rabbitmq, minio } = status;
  const queues = rabbitmq.queues ?? [];
  const totalQueueMessages = queues.reduce((sum, queue) => sum + queue.messages, 0);
  const totalQueueConsumers = queues.reduce((sum, queue) => sum + queue.consumers, 0);
  const buckets = mergeBucketStats(status);
  const totalObjects = minio.total_objects ?? buckets.reduce((sum, [, stats]) => sum + stats.objects, 0);
  const totalBytes = minio.total_bytes ?? buckets.reduce((sum, [, stats]) => sum + stats.bytes, 0);

  return <section className={styles.adminPage}>
    <header className={styles.adminHero}>
      <div><span className={styles.heroEyebrow}>HẠ TẦNG</span><h1>Hạ tầng lưu trữ</h1><p>Thông tin tổng quan về RabbitMQ (hàng đợi tin nhắn) và MinIO (lưu trữ tài liệu) của hệ thống.</p></div>
      <div className={styles.heroActions}>
        <button className={styles.exportButton} type="button" disabled={refreshing} onClick={refresh}>⟳ {refreshing ? 'Đang làm mới…' : 'Làm mới'}</button>
      </div>
    </header>

    <div className={styles.adminStats}>
      <div className={styles.adminStat}>
        <span className={styles.statIconPurple}>◈</span>
        <div><small>RabbitMQ</small><strong>{rabbitmq.ok ? formatCount(totalQueueMessages) : '—'}</strong><span>tin nhắn đang chờ xử lý</span></div>
      </div>
      <div className={styles.adminStat}>
        <span className={styles.statIconGreen}>▤</span>
        <div><small>MinIO</small><strong>{minio.ok ? formatCount(totalObjects) : '—'}</strong><span>đối tượng đã lưu trữ</span></div>
      </div>
      <div className={styles.adminStat}>
        <span className={styles.statIconBlue}>≡</span>
        <div><small>Dung lượng</small><strong>{minio.ok ? formatBytes(totalBytes) : '—'}</strong><span>tổng dung lượng tài liệu</span></div>
      </div>
    </div>

    <div className={styles.adminPanel} style={{ marginBottom: 18 }}>
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.panelEyebrow}>MESSAGE BROKER</span>
          <h2>RabbitMQ</h2>
        </div>
        {rabbitmq.ok
          ? <span className={styles.heroStatus}><span>●</span><strong>Hoạt động</strong><small>{rabbitmq.node}{rabbitmq.version ? ` · v${rabbitmq.version}` : ''}</small></span>
          : <span className={styles.disabledChip}>Không khả dụng</span>}
      </div>
      {rabbitmq.ok ? (
        <>
          <div className={styles.adminStats}>
            <div className={styles.adminStat}>
              <div><small>Hàng đợi</small><strong>{formatCount(queues.length)}</strong><span>queues</span></div>
            </div>
            <div className={styles.adminStat}>
              <div><small>Kết nối</small><strong>{formatCount(rabbitmq.connections ?? 0)}</strong><span>connections · {formatCount(rabbitmq.channels ?? 0)} channels</span></div>
            </div>
            <div className={styles.adminStat}>
              <div><small>Exchange</small><strong>{formatCount(rabbitmq.exchanges ?? 0)}</strong><span>tốc độ publish {(rabbitmq.publish_rate ?? 0).toFixed(1)} msg/s</span></div>
            </div>
          </div>
          {queues.length > 0 && <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Hàng đợi</th><th>Tin nhắn</th><th>Sẵn sàng</th><th>Chưa xác nhận</th><th>Consumer</th><th>Bộ nhớ</th><th>Trạng thái</th></tr></thead>
              <tbody>{queues.map(queue => <tr key={queue.name}>
                <td><code>{queue.name}</code></td>
                <td>{formatCount(queue.messages)}</td>
                <td>{formatCount(queue.messages_ready)}</td>
                <td>{formatCount(queue.messages_unacknowledged)}</td>
                <td>{formatCount(queue.consumers)}</td>
                <td>{formatBytes(queue.memory)}</td>
                <td><span className={queue.state === 'running' ? styles.enabledChip : styles.disabledChip}>{queue.state}</span></td>
              </tr>)}</tbody>
            </table>
          </div>}
          <p className={styles.muted} style={{ marginBottom: 0, fontSize: '.66rem' }}>Consumer đang hoạt động: {formatCount(totalQueueConsumers)} · {rabbitmq.disk_free_bytes !== undefined ? `Dung lượng đĩa còn lại: ${formatBytes(rabbitmq.disk_free_bytes)}` : 'Không có dữ liệu đĩa'}</p>
        </>
      ) : <p className={styles.muted}>{rabbitmq.error}</p>}
    </div>

    <div className={styles.adminPanel}>
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.panelEyebrow}>OBJECT STORAGE</span>
          <h2>MinIO</h2>
        </div>
        {minio.ok
          ? <span className={styles.heroStatus}><span>●</span><strong>Hoạt động</strong><small>{buckets.length} buckets</small></span>
          : <span className={styles.disabledChip}>Không khả dụng</span>}
      </div>
      {minio.ok ? (
        <>
          {minio.limited && <div className={styles.adminNotice}><span className={styles.noticeIcon}>!</span><div><strong>Kết quả có giới hạn</strong><p>Một số bucket có trên 200.000 đối tượng nên số liệu chỉ phản ánh phần đã liệt kê.</p></div></div>}
          {buckets.length > 0 && <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Bucket</th><th>Đối tượng</th><th>Dung lượng</th></tr></thead>
              <tbody>{buckets.map(([name, stats]) => <tr key={name}>
                <td><code>{name}</code></td>
                <td>{formatCount(stats.objects)}</td>
                <td>{formatBytes(stats.bytes)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          <p className={styles.muted} style={{ marginBottom: 0, fontSize: '.66rem' }}>Tổng cộng {formatCount(totalObjects)} đối tượng · {formatBytes(totalBytes)} · cập nhật lúc {formatTime(status.generated_at)}</p>
        </>
      ) : <p className={styles.muted}>{minio.error}</p>}
    </div>
  </section>;
}