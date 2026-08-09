'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { documentsApi } from '@/api/documents';
import { tasksApi } from '@/api/tasks';
import { grantsApi } from '@/api/grants';
import { readSession } from '@/auth/session';
import { ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import { SearchableSelect } from '@/components/searchable-select';
import { GatewayError } from '@/lib/errors';
import type { Document, DocumentVersion, PreviewSession } from '@/types/document';
import type { Task } from '@/types/task';
import { DocumentPreview } from './document-preview';
import styles from './documents.module.css';

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
  const [previewVersion, setPreviewVersion] = useState<number>();
  const [previewCapabilities, setPreviewCapabilities] = useState<PreviewSession['capabilities']>();
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

        const preferredTaskId =
          (taskId && access[taskId] ? taskId : '') ||
          Object.keys(access)[0] ||
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
  const canPreview = Boolean(activeTaskId) && activePermissions.includes('PREVIEW'); const canDownload = Boolean(activeTaskId) && activePermissions.includes('DOWNLOAD') && previewCapabilities?.download !== false;

  const closePreview = () => {
    setPreviewVersion(undefined);
    setPreviewCapabilities(undefined);
  };

  const openPreview = (version: number) => { if (!canPreview) { setStatus('Bạn không có quyền PREVIEW trong task đang chọn.'); return; }
    setPreviewCapabilities(undefined);
    setPreviewVersion(version);
    setStatus('Đang chuẩn bị các trang xem trước có watermark…');
  };

  const download = async (version: DocumentVersion) => {
    if (!activeTaskId || !canDownload) {
      setStatus('Tài khoản không có quyền DOWNLOAD trong công việc đang chọn.');
      return;
    }
    setBusy(`download-${version.id}`);
    setStatus('Đang chuẩn bị tải xuống bảo mật…');
    try {
      const ticket = await documentsApi.ticket(id, version.version, activeTaskId);
      const blob = await documentsApi.redeem(id, version.version, ticket.id);
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
      <div className={styles.heroActions}>{canPreview && <button type="button" disabled={!latestVersion || !canPreview || Boolean(busy)} onClick={() => latestVersion && openPreview(latestVersion.version)}>◉ Xem trước</button>}<button type="button" disabled={contextsLoading || !canDownload || Boolean(busy)} title={!canDownload ? 'Bạn không có quyền DOWNLOAD' : undefined} onClick={() => latestVersion && void download(latestVersion)}>Tải bản mới nhất</button></div>
    </header>

    <div className={styles.documentDetailGrid}>
      <main className={styles.documentMainColumn}>
        {previewVersion ? <DocumentPreview documentId={id} version={previewVersion} taskId={activeTaskId || undefined} onClose={closePreview} onCapabilitiesChange={setPreviewCapabilities} /> : <section className={styles.previewEmpty}><span>◎</span><h2>Xem trước tài liệu an toàn</h2><p>Nội dung được backend render thành từng trang có watermark. Luồng PREVIEW không tạo download ticket và không gửi file gốc.</p>{canPreview && <button type="button" disabled={!latestVersion || !canPreview || Boolean(busy)} onClick={() => latestVersion && openPreview(latestVersion.version)}>Xem trước an toàn</button>}</section>}

        <section className={styles.versionPanel}><div className={styles.panelHeading}><div><span>Lịch sử tài liệu</span><h2>Các phiên bản</h2></div><strong>{versions.length} phiên bản</strong></div><div className={styles.versionTableWrap}><table><thead><tr><th>Phiên bản</th><th>MIME type</th><th>Kích thước</th><th>Hành động</th></tr></thead><tbody>{versions.map(version => <tr key={version.id}><td><span className={styles.versionBadge}>v{version.version}</span>{version.version === document.current_version && <small>Mới nhất</small>}</td><td>{version.mime_type}</td><td>{version.file_size.toLocaleString()} bytes</td><td><div className={styles.rowActions}>{canPreview && <button type="button" disabled={!canPreview || Boolean(busy)} onClick={() => openPreview(version.version)}>Xem trước</button>}<button type="button" disabled={contextsLoading || !canDownload || Boolean(busy)} title={!canDownload ? 'Bạn không có quyền DOWNLOAD' : undefined} onClick={() => void download(version)}>{busy === 'download-' + version.id ? 'Đang tải…' : 'Tải xuống'}</button></div></td></tr>)}</tbody></table></div></section>
      </main>

      <aside className={styles.documentSideColumn}>
        <section className={styles.contextCard}><span className={styles.cardLabel}>Task context</span><h2>Quyền truy cập</h2>{contextsLoading ? <p>Đang dò công việc đã gắn tài liệu…</p> : Object.keys(permissionsByTask).length > 0 ? <>{contexts.length > 0 && <label>Công việc được ủy quyền<SearchableSelect value={activeTaskId} onChange={event => { setActiveTaskId(event.target.value); closePreview(); }}>{contexts.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</SearchableSelect></label>}<div className={styles.contextSuccess}><span>✓</span><p><strong>Capability đang có</strong>{activePermissions.length ? activePermissions.join(' · ') : 'Không có quyền trong task context này'}</p></div>{!activePermissions.includes('DOWNLOAD') && <div className={styles.contextWarning}><span>!</span><p><strong>Chỉ được xem trước</strong>Backend sẽ phát các trang có watermark; download ticket vẫn bị từ chối.</p></div>}</> : <div className={styles.contextWarning}><span>!</span><p><strong>Không tìm thấy task context</strong>Backend vẫn kiểm tra quyền khi tạo preview session. Tải xuống cần grant DOWNLOAD kèm task_id.</p></div>}</section>
        <section className={styles.infoCard}><span className={styles.cardLabel}>Thông tin</span><dl><div><dt>Loại tài liệu</dt><dd>{document.document_type}</dd></div><div><dt>Mức bảo mật</dt><dd>{document.security_level}</dd></div><div><dt>Phiên bản hiện tại</dt><dd>v{document.current_version}</dd></div><div><dt>Trạng thái</dt><dd>{document.status}</dd></div><div><dt>Cập nhật</dt><dd>{new Date(document.updated_at).toLocaleDateString()}</dd></div></dl></section>
      </aside>
    </div>
    {status && <div className={styles.documentToast} role="status">{status}</div>}
  </section>;
}