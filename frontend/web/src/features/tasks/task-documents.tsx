'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { documentsApi } from '@/api/documents';
import { DocumentPreview } from '@/features/documents/document-preview';
import type { Task, TaskChildSummary } from '@/types/task';
import type { Participant } from '@/types/task';
import type { MemberOption } from '@/types/admin';
import type { TaskDocument } from '@/types/document';
import type { Grant } from '@/types/grant';
import { readSession } from '@/auth/session';
import { GatewayError } from '@/lib/errors';
import styles from './task-documents.module.css';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const GRANTABLE_PERMISSIONS = ['PREVIEW', 'DOWNLOAD', 'UPDATE', 'SHARE', 'TRANSFER', 'DISPOSE'];
const permissionLabel: Record<string, string> = { PREVIEW: 'Xem', DOWNLOAD: 'Tải xuống', UPDATE: 'Cập nhật', SHARE: 'Chia sẻ', TRANSFER: 'Chuyển giao', DISPOSE: 'Hủy' };
const isFutureExpiry = (value: string) => new Date(value).getTime() > Date.now();
const defaultExpiry = () => { const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); const pad = (n: number) => String(n).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; };
const toLocalInputValue = (value: string) => { const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const pad = (n: number) => String(n).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; };

export function TaskDocuments({ task, canUpload = false, members = [], participants = [], childTasks = [] }: { task: Task; canUpload?: boolean; members?: MemberOption[]; participants?: Participant[]; childTasks?: TaskChildSummary[] }) {
  const [items, setItems] = useState<TaskDocument[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<{ documentId: string; version: number }>();
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detachingId, setDetachingId] = useState<string>(); const [childTaskId, setChildTaskId] = useState(''); const [sharingToChild, setSharingToChild] = useState(false);
  const [shareFor, setShareFor] = useState<TaskDocument>();
  const [shareActorId, setShareActorId] = useState('');
  const [sharePermissions, setSharePermissions] = useState<string[]>([]);
  const [shareExpiry, setShareExpiry] = useState(defaultExpiry);
  const [shareGrants, setShareGrants] = useState<Grant[]>([]);
  const [sharing, setSharing] = useState(false);
  const loadSequence = useRef(0);
  const session = readSession();
  const canDetach = (item: TaskDocument) =>
    item.permissions.includes('SHARE') || session?.userId === task.creator_id;

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    const isCurrent = () => loadSequence.current === sequence;
    setItems(null);
    setLoadFailed(false);
    try {
      const nextItems = await documentsApi.taskDocuments(task.id);
      if (isCurrent()) setItems(nextItems);
    } catch {
      if (isCurrent()) setLoadFailed(true);
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
    if (detachingId) return;
    if (!window.confirm('Xóa tài liệu khỏi task này?')) return;
    setDetachingId(item.document_id);
    setStatus('Đang xóa tài liệu khỏi task…');
    try {
      await documentsApi.detachFromTask(task.id, item.document_id);
      setStatus('Đã xóa tài liệu khỏi task.');
      await load();
    } catch {
      setStatus('Không thể detach tài liệu. Kiểm tra quyền task và thử lại.');
    } finally {
      setDetachingId(undefined);
    }
  };

  const shareToChild = async (item: TaskDocument) => { const child = childTasks.find(candidate => candidate.id === childTaskId); if (!child) { setStatus('Chọn sub-task trước khi gắn tài liệu.'); return; } const actorIds = Array.from(new Set([child.creator_id, child.assignee_id, child.reviewer_id].filter((value): value is string => Boolean(value)))); if (actorIds.length === 0) { setStatus('Sub-task chưa có người nhận quyền.'); return; } const expiresAt = child.deadline && new Date(child.deadline).getTime() > Date.now() ? child.deadline : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); setSharingToChild(true); setStatus('Đang gắn tài liệu vào sub-task…'); try { await documentsApi.attachToTask(child.id, item.document_id, actorIds.map(actor_id => ({ actor_id, permissions: ['PREVIEW', 'DOWNLOAD'], expires_at: expiresAt }))); setStatus('Đã gắn tài liệu vào sub-task.'); setChildTaskId(''); } catch (reason) { setStatus(reason instanceof GatewayError ? 'Không thể gắn tài liệu (' + reason.status + '). Kiểm tra quyền SHARE và thành viên sub-task.' : 'Không thể gắn tài liệu vào sub-task.'); } finally { setSharingToChild(false); } };
  const uploadDocument = async (event: ChangeEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (form.elements.namedItem('file') as HTMLInputElement).files?.[0];
    const session = readSession();
    if (!file || !session?.userId) { setStatus('Chọn tài liệu và đăng nhập lại để tải lên.'); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setStatus('Tệp vượt quá giới hạn 5 MB và chưa được tải lên.'); return; }
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
      setUploadOpen(false);
      setStatus('Đã tải và gắn tài liệu riêng cho task này.');
      await load();
    } catch (reason) {
      setStatus(reason instanceof GatewayError ? `Không thể tải tài liệu (${reason.status}).` : 'Không thể tải tài liệu.');
    } finally { setUploading(false); }
  };
  const currentUserId = readSession()?.userId;
  const memberById = new Map(members.map(member => [member.id, member]));
  const recipientIds = Array.from(new Set([task.creator_id, task.assignee_id, ...participants.map(item => item.user_id)].filter((value): value is string => Boolean(value)))).filter(userId => userId !== currentUserId);
  const recipients = recipientIds
    .map(userId => memberById.get(userId) ?? { id: userId, email: userId.slice(0, 8) })
    .sort((a, b) => a.email.localeCompare(b.email));
  const openShare = (item: TaskDocument) => {
    setShareFor(item);
    setShareActorId('');
    setSharePermissions([]);
    setShareExpiry('');
    setShareGrants([]);
    setStatus('');
    documentsApi
      .listGrants(task.id, item.document_id)
      .then(result => setShareGrants(result.items ?? []))
      .catch(() => setShareGrants([]));
  };
  const closeShare = () => { setShareFor(undefined); setShareActorId(''); setSharePermissions([]); setShareExpiry(''); setShareGrants([]); setStatus(''); };
  const selectShareActor = (actorId: string) => {
    setShareActorId(actorId);
    setStatus('');
    const current = shareGrants
      .filter(grant => grant.actor_id === actorId && grant.status === 'ACTIVE')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    if (current) {
      setSharePermissions(current.permissions ?? []);
      setShareExpiry(toLocalInputValue(current.expires_at));
    } else {
      setSharePermissions([]);
      setShareExpiry('');
    }
  };
  const toggleSharePermission = (permission: string) => {
    setSharePermissions(current => current.includes(permission) ? current.filter(item => item !== permission) : [...current, permission]);
  };
  useEffect(() => {
    if (!shareFor) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeShare();
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [shareFor]);

  const shareDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!shareFor || sharing) return;
    if (!shareActorId) { setStatus('Hãy chọn người nhận quyền.'); return; }
    if (sharePermissions.length === 0) { setStatus('Hãy chọn ít nhất một quyền để cấp.'); return; }
    if (!shareExpiry) { setStatus('Hãy chọn thời hạn hiệu lực.'); return; }
    const expiresAt = new Date(shareExpiry);
    if (!isFutureExpiry(shareExpiry)) { setStatus('Thời hạn hiệu lực phải ở tương lai.'); return; }
    setSharing(true);
    setStatus(`Đang cấp quyền cho ${memberById.get(shareActorId)?.email ?? 'thành viên'}…`);
    try {
      await documentsApi.addGrant(task.id, shareFor.document_id, {
        actor_id: shareActorId,
        permissions: sharePermissions,
        expires_at: expiresAt.toISOString(),
      });
      setStatus(`Đã cấp quyền cho ${memberById.get(shareActorId)?.email ?? 'thành viên'} tới tài liệu "${shareFor.title}".`);
      closeShare();
    } catch (reason) {
      setStatus(reason instanceof GatewayError ? `Không thể cấp quyền (${reason.status}). Người nhận phải là thành viên trực tiếp của task.` : 'Không thể cấp quyền cho người nhận.');
    } finally { setSharing(false); }
  };
  return <section className={styles.section} aria-labelledby="task-documents-title">
    <div className={styles.heading}><div><p className={styles.eyebrow}>Tệp trong công việc</p><h2 id="task-documents-title">Tài liệu đính kèm</h2></div><div className={styles.headingActions}><span>{items ? `${items.length} tệp` : '—'}</span>{canUpload && <button className={styles.addAttachment} type="button" aria-expanded={uploadOpen} onClick={() => setUploadOpen(value => !value)}>＋ Thêm</button>}</div></div>
    {canUpload && uploadOpen && <form className={styles.uploadForm} onSubmit={uploadDocument}>
      <label>Tải tài liệu vào task này<input name="file" type="file" required disabled={uploading} /></label>
      <label>Tên hiển thị <span>Tùy chọn</span><input name="title" placeholder="Mặc định theo tên file" disabled={uploading} /></label>
      <button type="submit" disabled={uploading}>{uploading ? 'Đang tải…' : 'Tải lên task này'}</button>
    </form>}
    {status && <p className={styles.status} role="status">{status}</p>}
    {preview && <DocumentPreview documentId={preview.documentId} version={preview.version} taskId={task.id} onClose={() => setPreview(undefined)} />}
    {loadFailed ? <div className={styles.loadError} role="alert"><span aria-hidden="true">!</span><div><strong>Không tải được tài liệu</strong><p>Đây là lỗi tải dữ liệu, không phải trạng thái “0 tệp”. Hãy thử tải lại.</p></div><button type="button" onClick={() => void load()}>Tải lại</button></div> : <div className={styles.documentGrid}>
      {items?.map(item => <article className={styles.documentCard} key={item.association_id}><span className={styles.documentIcon}>▧</span><div>{item.permissions.includes('PREVIEW') ? <button type="button" className={styles.documentTitle} onClick={() => openPreview(item)}>{item.title}</button> : <strong className={styles.documentTitleDisabled}>{item.title}</strong>}<small>{item.document_type} · v{item.current_version}</small></div><span className={styles.security}>{item.security_level}</span>{item.permissions.includes("SHARE") && childTasks.length > 0 && <div className={styles.childShare}><label>Gắn vào sub-task<select value={childTaskId} onChange={event => setChildTaskId(event.target.value)}><option value="">Chọn sub-task</option>{childTasks.map(child => <option key={child.id} value={child.id}>{child.title}</option>)}</select></label><button type="button" disabled={!childTaskId || sharingToChild} onClick={() => void shareToChild(item)}>{sharingToChild ? "Đang gắn…" : "Gắn vào sub-task"}</button></div>}<footer className={styles.documentFooter} role="group" aria-label={`Thao tác với tệp ${item.title}`}><span>{item.permissions.join(' · ')}</span><div className={styles.documentActions}>{item.permissions.includes('PREVIEW') && <button type="button" onClick={() => openPreview(item)}>Xem trước</button>}<button type="button" className={styles.downloadButton} disabled={!item.permissions.includes('DOWNLOAD')} title={!item.permissions.includes('DOWNLOAD') ? 'Bạn không có quyền DOWNLOAD' : undefined} onClick={() => void downloadDocument(item)}>Tải xuống</button>{item.permissions.includes('SHARE') && <button type="button" className={styles.shareButton} onClick={() => openShare(item)}>Chia sẻ quyền</button>}{canDetach(item) && <button type="button" className={styles.detachButton} disabled={detachingId === item.document_id} onClick={() => void detachDocument(item)}>Xóa khỏi task</button>}{!item.permissions.includes('PREVIEW') && !item.permissions.includes('DOWNLOAD') && <span className={styles.noAction}>Bạn không có quyền thao tác</span>}</div></footer></article>)}
      {items?.length === 0 && <p className={styles.empty}>Chưa có tài liệu nào được gắn vào công việc này.</p>}
      {items === null && <p className={styles.empty}>Đang tải tài liệu…</p>}
    </div>}
    {shareFor && <div className={styles.shareDialog} role="dialog" aria-modal="true" aria-labelledby={`share-title-${shareFor.document_id}`}><form className={styles.sharePanel} onSubmit={shareDocument}><div className={styles.shareHeader}><div><p className={styles.eyebrow}>Chia sẻ quyền truy cập</p><h3 id={`share-title-${shareFor.document_id}`}>Cấp quyền cho “{shareFor.title}”</h3><p className={styles.shareSub}>Người nhận phải là thành viên trực tiếp của task. Hiệu lực giới hạn theo deadline task.</p></div><button type="button" className={styles.shareClose} aria-label="Đóng biểu mẫu chia sẻ quyền" onClick={closeShare} disabled={sharing}>×</button></div><div className={styles.shareBody}><label>Người nhận<select name="actor_id" value={shareActorId} onChange={event => selectShareActor(event.target.value)} required><option value="" disabled>Chọn thành viên trong task</option>{recipients.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</select></label><fieldset className={styles.permissionField}><legend>Quyền được cấp</legend><p>Chọn ít nhất một quyền cho người nhận.</p><div className={styles.permissionGrid}>{GRANTABLE_PERMISSIONS.map(permission => <label key={permission}><input type="checkbox" checked={sharePermissions.includes(permission)} onChange={() => toggleSharePermission(permission)} /><span>{permissionLabel[permission] ?? permission}</span></label>)}</div></fieldset><label>Hiệu lực đến<input name="expires_at" type="datetime-local" value={shareExpiry} onChange={event => { setShareExpiry(event.target.value); setStatus(''); }} required /></label>{status && <p className={styles.shareStatus} role="status">{status}</p>}</div><div className={styles.shareActions}><button type="button" className={styles.cancelButton} onClick={closeShare} disabled={sharing}>Hủy</button><button type="submit" className={styles.submitButton} disabled={sharing}>{sharing ? 'Đang cấp quyền…' : 'Cấp quyền'}</button></div></form></div>}
  </section>;
}
