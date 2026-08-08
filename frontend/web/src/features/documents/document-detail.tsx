'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { documentsApi } from '@/api/documents';
import { tasksApi } from '@/api/tasks';
import { grantsApi } from '@/api/grants';
import { readSession } from '@/auth/session';
import { ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import { GatewayError } from '@/lib/errors';
import type { Document, DocumentVersion } from '@/types/document';
import type { Task } from '@/types/task';
import styles from './documents.module.css';
import { SearchableSelect } from '@/components/searchable-select';

type SafePreview = { id: string; title: string; security_level: string; document_type: string };

const fileName = (document: Document, version: DocumentVersion) => {
  const extension = document.document_type.toLowerCase();
  return document.title.toLowerCase().endsWith(`.${extension}`) ? document.title : `${document.title}.${extension || version.mime_type.split('/')[1] || 'bin'}`;
};

const isActiveGrant = (grant: { status: string; revoked_at: string | null; effective_expires_at: string; expires_at: string }) =>
  grant.status === 'ACTIVE' && !grant.revoked_at && new Date(grant.effective_expires_at || grant.expires_at).getTime() > Date.now();

export function DocumentDetail({ id, taskId }: { id: string; taskId?: string }) {
  const [document, setDocument] = useState<Document | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [contexts, setContexts] = useState<Task[]>([]);
  const [permissionsByTask, setPermissionsByTask] = useState<Record<string, string[]>>({});
  const [activeTaskId, setActiveTaskId] = useState(taskId ?? '');
  const [contextsLoading, setContextsLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState<SafePreview>();
  const [error, setError] = useState<number>();

  const load = () => {
    setDocument(null);
    setError(undefined);
    Promise.all([documentsApi.get(id), documentsApi.versions(id)])
      .then(([doc, items]) => { setDocument(doc); setVersions(items); })
      .catch((reason: unknown) => setError(reason instanceof GatewayError ? reason.status : 503));
  };

  useEffect(load, [id]);
  useEffect(() => {
    let cancelled = false;
    const discoverContexts = async () => {
      setContextsLoading(true);
      try {
        const actorId = readSession()?.userId;
        const [tasks, grants] = await Promise.all([
          tasksApi.list(),
          actorId ? grantsApi.list(actorId).catch(() => []) : Promise.resolve([]),
        ]);
        const candidates = taskId ? tasks.filter(task => task.id === taskId) : tasks;
        const checks = await Promise.all(candidates.map(async task => {
          try {
            const attached = await documentsApi.taskDocuments(task.id);
            const item = attached.find(candidate => candidate.document_id === id);
            return item ? { task, permissions: item.permissions } : null;
          } catch {
            return null;
          }
        }));
        if (cancelled) return;

        const associations = checks.filter((item): item is { task: Task; permissions: string[] } => item !== null);
        const access: Record<string, string[]> = {};
        for (const association of associations) access[association.task.id] = [...new Set(association.permissions)];

        const activeGrants = grants.filter(grant =>
          grant.resource_type === 'DOCUMENT' &&
          grant.resource_id === id &&
          Boolean(grant.task_id) &&
          isActiveGrant(grant)
        );
        for (const grant of activeGrants) {
          access[grant.task_id] = [...new Set([...(access[grant.task_id] ?? []), ...grant.permissions])];
        }

        const availableTaskIds = Object.keys(access);
        const preferredTaskId =
          (taskId && access[taskId] ? taskId : '') ||
          availableTaskIds[0] ||
          '';

        setContexts(associations.map(item => item.task));
        setPermissionsByTask(access);
        setActiveTaskId(preferredTaskId);
      } catch {
        if (!cancelled) setStatus('Không thể tự tìm công việc đã cấp quyền cho tài liệu này.');
      } finally {
        if (!cancelled) setContextsLoading(false);
      }
    };
    void discoverContexts();
    return () => { cancelled = true; };
  }, [id, taskId]);

  const latestVersion = useMemo(() => versions.find(item => item.version === document?.current_version) ?? versions.at(-1), [document?.current_version, versions]);
  const activePermissions = permissionsByTask[activeTaskId] ?? [];
  const canDownload = Boolean(activeTaskId) && activePermissions.includes('DOWNLOAD');

  const redeem = async (version: DocumentVersion) => {
    if (!activeTaskId || !canDownload) {
      throw new GatewayError(403, 'Tài khoản không có quyền DOWNLOAD trong task context đang chọn.');
    }
    const ticket = await documentsApi.ticket(id, version.version, activeTaskId);
    return documentsApi.redeem(id, version.version, ticket.id);
  };

  const openPreview = async () => {
    setBusy('preview');
    setStatus('Đang tải bản xem trước an toàn…');
    try {
      const metadata = await documentsApi.preview(id);
      setPreview(metadata);
      setStatus('Đã tải bản xem trước an toàn bằng quyền PREVIEW.');
    } catch (reason) {
      setStatus(reason instanceof GatewayError ? `Không thể xem trước (${reason.status}): ${reason.message}` : 'Không thể xem trước tài liệu.');
    } finally {
      setBusy('');
    }
  };

  const download = async (version: DocumentVersion) => {
    setBusy(`download-${version.id}`);
    setStatus('Đang chuẩn bị tải xuống bảo mật…');
    try {
      const blob = await redeem(version);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document ? fileName(document, version) : 'download';
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatus(`Đã bắt đầu tải ${link.download}.`);
    } catch (reason) {
      setStatus(reason instanceof GatewayError ? `Không thể tải xuống (${reason.status}): ${reason.message}` : 'Không thể tải xuống tài liệu.');
    } finally {
      setBusy('');
    }
  };

  if (error === 403) return <PermissionDeniedState />;
  if (error) return <ErrorState message="Không tải được chi tiết tài liệu." onRetry={load} />;
  if (!document) return <LoadingState />;

  return <section className={styles.documentDetailPage}>
    <nav className={styles.documentBreadcrumb} aria-label="Breadcrumb"><Link href="/documents">Tài liệu</Link><span>›</span><span>{document.title}</span></nav>
    <header className={styles.documentHero}>
      <div className={styles.documentHeroIcon}>▧</div>
      <div className={styles.documentHeroCopy}><span className={styles.documentEyebrow}>Secure document · v{document.current_version}</span><h1>{document.title}</h1><div className={styles.documentChips}><span>{document.document_type}</span><span className={styles[`level${document.security_level}`]}>{document.security_level}</span><span className={styles.statusChip}>{document.status}</span></div></div>
      <div className={styles.heroActions}><button type="button" disabled={Boolean(busy)} onClick={() => void openPreview()}>◉ Xem trước</button><button type="button" disabled={!latestVersion || contextsLoading || !canDownload || Boolean(busy)} onClick={() => latestVersion && void download(latestVersion)}>⇩ Tải bản mới nhất</button></div>
    </header>

    <div className={styles.documentDetailGrid}>
      <main className={styles.documentMainColumn}>
        {preview ? <section className={styles.blobPreview}><div className={styles.previewToolbar}><div><strong>{preview.title}</strong><span>Bản xem trước an toàn · quyền PREVIEW</span></div><button type="button" onClick={() => setPreview(undefined)}>Đóng</button></div><div className={styles.safePreviewMetadata}><span>◎</span><h2>Metadata tài liệu</h2><dl><div><dt>Loại tài liệu</dt><dd>{preview.document_type}</dd></div><div><dt>Mức bảo mật</dt><dd>{preview.security_level}</dd></div><div><dt>Mã tài liệu</dt><dd>{preview.id}</dd></div></dl><p>Backend chỉ trả metadata an toàn cho quyền PREVIEW. Nội dung tệp yêu cầu quyền DOWNLOAD.</p></div></section> : <section className={styles.previewEmpty}><span>◎</span><h2>Xem trước tài liệu an toàn</h2><p>Quyền PREVIEW cho phép xem metadata an toàn của tài liệu mà không tạo download ticket.</p><button type="button" disabled={Boolean(busy)} onClick={() => void openPreview()}>{busy === 'preview' ? 'Đang xử lý…' : 'Xem trước an toàn'}</button></section>}

        <section className={styles.versionPanel}><div className={styles.panelHeading}><div><span>Lịch sử tài liệu</span><h2>Các phiên bản</h2></div><strong>{versions.length} phiên bản</strong></div><div className={styles.versionTableWrap}><table><thead><tr><th>Phiên bản</th><th>MIME type</th><th>Kích thước</th><th>Hành động</th></tr></thead><tbody>{versions.map(version => <tr key={version.id}><td><span className={styles.versionBadge}>v{version.version}</span>{version.version === document.current_version && <small>Mới nhất</small>}</td><td>{version.mime_type}</td><td>{version.file_size.toLocaleString()} bytes</td><td><div className={styles.rowActions}><button type="button" disabled={Boolean(busy)} onClick={() => void openPreview()}>{busy === 'preview' ? 'Đang mở…' : 'Xem trước'}</button><button type="button" disabled={contextsLoading || !canDownload || Boolean(busy)} onClick={() => void download(version)}>{busy === `download-${version.id}` ? 'Đang tải…' : 'Tải xuống'}</button></div></td></tr>)}</tbody></table></div></section>
      </main>

      <aside className={styles.documentSideColumn}>
        <section className={styles.contextCard}><span className={styles.cardLabel}>Task context</span><h2>Quyền truy cập</h2>{contextsLoading ? <p>Đang dò công việc đã gắn tài liệu…</p> : Object.keys(permissionsByTask).length > 0 ? <>{contexts.length > 0 && <label>Công việc được ủy quyền<SearchableSelect value={activeTaskId} onChange={event => setActiveTaskId(event.target.value)}>{contexts.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</SearchableSelect></label>}<div className={styles.contextSuccess}><span>✓</span><p><strong>Capability đang có</strong>{activePermissions.length ? activePermissions.join(' · ') : 'Không có quyền trong task context này'}</p></div>{!canDownload && <div className={styles.contextWarning}><span>!</span><p><strong>Không có quyền DOWNLOAD</strong>Bạn vẫn có thể xem metadata bằng PREVIEW, nhưng không thể tải nội dung tệp.</p></div>}</> : <div className={styles.contextWarning}><span>!</span><p><strong>Không tìm thấy task context</strong>Xem trước vẫn được backend kiểm tra bằng quyền PREVIEW. Tải xuống cần grant DOWNLOAD kèm task_id.</p></div>}</section>
        <section className={styles.infoCard}><span className={styles.cardLabel}>Thông tin</span><dl><div><dt>Loại tài liệu</dt><dd>{document.document_type}</dd></div><div><dt>Mức bảo mật</dt><dd>{document.security_level}</dd></div><div><dt>Phiên bản hiện tại</dt><dd>v{document.current_version}</dd></div><div><dt>Trạng thái</dt><dd>{document.status}</dd></div><div><dt>Cập nhật</dt><dd>{new Date(document.updated_at).toLocaleDateString()}</dd></div></dl></section>
      </aside>
    </div>
    {status && <div className={styles.documentToast} role="status">{status}</div>}
  </section>;
}