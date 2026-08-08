'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { documentsApi } from '@/api/documents';
import type { Task } from '@/types/task';
import type { TaskDocument } from '@/types/document';
import styles from './task-documents.module.css';

export function TaskDocuments({ task }: { task: Task }) {
  const [items, setItems] = useState<TaskDocument[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<{ id: string; title: string; document_type: string; security_level: string }>();
  const load = useCallback(async () => {
    setItems(null);
    setLoadFailed(false);
    try {
      setItems(await documentsApi.taskDocuments(task.id));
    } catch {
      setLoadFailed(true);
    }
  }, [task.id]);
  useEffect(() => { void load(); }, [load]);

  const downloadDocument = async (item: TaskDocument) => {
    setStatus(`Đang chuẩn bị tải ${item.title}…`);
    try {
      const ticket = await documentsApi.ticket(item.document_id, item.current_version, task.id);
      const blob = await documentsApi.redeem(item.document_id, item.current_version, ticket.id);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      const extension = item.document_type.toLowerCase();
      link.href = url;
      link.download = item.title.toLowerCase().endsWith(`.${extension}`) ? item.title : `${item.title}.${extension}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatus(`Đã bắt đầu tải ${link.download}.`);
    } catch {
      setStatus('Không thể tải tài liệu. Kiểm tra quyền DOWNLOAD và thử lại.');
    }
  };

  const openPreview = async (item: TaskDocument) => {
    setStatus('Đang tải bản xem trước an toàn…');
    try {
      const metadata = await documentsApi.preview(item.document_id);
      setPreview(metadata);
      setStatus('Đã tải bản xem trước an toàn bằng quyền PREVIEW.');
    } catch {
      setStatus('Không thể xem trước. Kiểm tra quyền PREVIEW và thử lại.');
    }
  };

  return <section className={styles.section} aria-labelledby="task-documents-title">
    <div className={styles.heading}><div><h2 id="task-documents-title">Tài liệu đính kèm</h2><p>Tài liệu đã được gắn khi tạo công việc.</p></div><span>{items ? `${items.length} tệp` : '—'}</span></div>
    {status && <p className={styles.status} role="status">{status}</p>}
    {preview && <div className={styles.previewPanel}><div><strong>{preview.title}</strong><span>Bản xem trước an toàn</span><button type="button" onClick={() => setPreview(undefined)}>Đóng</button></div><dl><div><dt>Loại tài liệu</dt><dd>{preview.document_type}</dd></div><div><dt>Mức bảo mật</dt><dd>{preview.security_level}</dd></div><div><dt>Mã tài liệu</dt><dd>{preview.id}</dd></div></dl><p>Nội dung tệp chỉ được trả về khi có quyền DOWNLOAD. Quyền PREVIEW chỉ cho phép xem metadata an toàn.</p></div>}
    {loadFailed ? <div className={styles.loadError} role="alert"><span aria-hidden="true">!</span><div><strong>Không tải được tài liệu</strong><p>Đây là lỗi tải dữ liệu, không phải trạng thái “0 tệp”. Hãy thử tải lại.</p></div><button type="button" onClick={() => void load()}>Tải lại</button></div> : <div className={styles.documentGrid}>
      {items?.map(item => <article className={styles.documentCard} key={item.association_id}><span className={styles.documentIcon}>▧</span><div><Link href={'/documents/' + item.document_id + '?task_id=' + task.id}><strong>{item.title}</strong></Link><small>{item.document_type} · v{item.current_version}</small></div><span className={styles.security}>{item.security_level}</span><footer><span>{item.permissions.join(' · ')}</span><div className={styles.documentActions}><button type="button" disabled={!item.permissions.includes('PREVIEW')} onClick={() => void openPreview(item)}>Xem trước</button><button type="button" disabled={!item.permissions.includes('DOWNLOAD')} onClick={() => void downloadDocument(item)}>Tải xuống</button></div></footer></article>)}
      {items?.length === 0 && <p className={styles.empty}>Chưa có tài liệu nào được gắn vào công việc này.</p>}
      {items === null && <p className={styles.empty}>Đang tải tài liệu…</p>}
    </div>}
  </section>;
}
