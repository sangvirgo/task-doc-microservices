'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import Link from 'next/link';
import { ChangeEvent, useCallback, useEffect, useState } from 'react';
import { documentsApi } from '@/api/documents';
import { DocumentPreview } from '@/features/documents/document-preview';
import type { Task } from '@/types/task';
import type { TaskDocument } from '@/types/document';
import { readSession } from '@/auth/session';
import { GatewayError } from '@/lib/errors';
import styles from './task-documents.module.css';
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function TaskDocuments({ task }: { task: Task }) {
  const [items, setItems] = useState<TaskDocument[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<{ documentId: string; version: number }>();
  const [uploading, setUploading] = useState(false);

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

  const downloadDocument = async (item: TaskDocument) => { if (!item.permissions.includes('DOWNLOAD')) { setStatus('Bạn không có quyền DOWNLOAD cho tài liệu này.'); return; }
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

  const openPreview = (item: TaskDocument) => { if (!item.permissions.includes('PREVIEW')) { setStatus('Bạn không có quyền PREVIEW cho tài liệu này.'); return; }
    setPreview({ documentId: item.document_id, version: item.current_version });
    setStatus('Đang chuẩn bị các trang xem trước có watermark…');
  };
  const detachDocument = async (item: TaskDocument) => {
    if (!window.confirm('Detach this document from the task?')) return;
    setStatus('Detaching document…');
    try {
      await documentsApi.detachFromTask(task.id, item.document_id);
      setStatus('Document detached from this task.');
      await load();
    } catch {
      setStatus('Không thể detach tài liệu. Kiểm tra quyền task và thử lại.');
    }
  };

  const uploadDocument = async (event: ChangeEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (form.elements.namedItem('file') as HTMLInputElement).files?.[0];
    const session = readSession();
    if (!file || !session?.userId) { setStatus('Chọn tài liệu và đăng nhập lại để tải lên.'); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setStatus('Tệp vượt quá giới hạn 25 MB và chưa được tải lên.'); return; }
    const data = new FormData(form);
    const actors = Array.from(new Set([session.userId, task.creator_id, task.assignee_id].filter((value): value is string => Boolean(value))));
    const grants = actors.map(actor_id => ({ actor_id, permissions: actor_id === session.userId ? ['PREVIEW', 'DOWNLOAD'] : ['PREVIEW', 'DOWNLOAD'], expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }));
    data.set('file', file);
    data.set('title', String(data.get('title') || file.name.replace(/\.[^.]+$/, '') || file.name));
    data.set('document_type', file.name.split('.').pop()?.toUpperCase() || file.type || 'FILE');
    data.set('security_level', String(data.get('security_level') || 'INTERNAL'));
    data.set('declared_state_secret', 'false');
    data.set('task_id', task.id);
    data.set('grants', JSON.stringify(grants));
    setUploading(true);
    setStatus('Đang tải tài liệu lên…');
    try {
      await documentsApi.upload(data, percent => setStatus(`Đang tải tài liệu lên… ${percent}%`));
      form.reset();
      setStatus('Đã tải và gắn tài liệu riêng cho task này.');
      await load();
    } catch (reason) {
      setStatus(reason instanceof GatewayError ? `Không thể tải tài liệu (${reason.status}).` : 'Không thể tải tài liệu.');
    } finally { setUploading(false); }
  };
  return <section className={styles.section} aria-labelledby="task-documents-title">
    <form className={styles.uploadForm} onSubmit={uploadDocument}>
      <label>Tải tài liệu vào task này<input name="file" type="file" required disabled={uploading} /></label>
      <label>Tên hiển thị <span>Tùy chọn</span><input name="title" placeholder="Mặc định theo tên file" disabled={uploading} /></label>
      <button type="submit" disabled={uploading}>{uploading ? 'Đang tải…' : 'Tải lên task này'}</button>
    </form>
    <div className={styles.heading}><div><h2 id="task-documents-title">Tài liệu đính kèm</h2><p>Tài liệu đã được gắn khi tạo công việc.</p></div><span>{items ? `${items.length} tệp` : '—'}</span></div>
    {status && <p className={styles.status} role="status">{status}</p>}
    {preview && <DocumentPreview documentId={preview.documentId} version={preview.version} taskId={task.id} onClose={() => setPreview(undefined)} />}
    {loadFailed ? <div className={styles.loadError} role="alert"><span aria-hidden="true">!</span><div><strong>Không tải được tài liệu</strong><p>Đây là lỗi tải dữ liệu, không phải trạng thái “0 tệp”. Hãy thử tải lại.</p></div><button type="button" onClick={() => void load()}>Tải lại</button></div> : <div className={styles.documentGrid}>
      {items?.map(item => <article className={styles.documentCard} key={item.association_id}><span className={styles.documentIcon}>▧</span><div><Link href={'/documents/' + item.document_id + '?task_id=' + task.id}><strong>{item.title}</strong></Link><small>{item.document_type} · v{item.current_version}</small></div><span className={styles.security}>{item.security_level}</span><footer><span>{item.permissions.join(' · ')}</span><div className={styles.documentActions}>{item.permissions.includes('PREVIEW') && <button type="button" onClick={() => openPreview(item)}>Xem trước</button>}<button type="button" className={styles.downloadButton} disabled={!item.permissions.includes('DOWNLOAD')} title={!item.permissions.includes('DOWNLOAD') ? 'Bạn không có quyền DOWNLOAD' : undefined} onClick={() => void downloadDocument(item)}>Tải xuống</button><button type="button" className={styles.detachButton} onClick={() => void detachDocument(item)}>Detach</button>{!item.permissions.includes('PREVIEW') && !item.permissions.includes('DOWNLOAD') && <span className={styles.noAction}>Bạn không có quyền thao tác</span>}</div></footer></article>)}
      {items?.length === 0 && <p className={styles.empty}>Chưa có tài liệu nào được gắn vào công việc này.</p>}
      {items === null && <p className={styles.empty}>Đang tải tài liệu…</p>}
    </div>}
  </section>;
}
