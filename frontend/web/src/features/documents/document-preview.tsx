'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import { documentsApi } from '@/api/documents';
import { GatewayError } from '@/lib/errors';
import type { PreviewSession } from '@/types/document';
import styles from './documents.module.css';

interface PreviewPage {
  page: number;
  url: string;
}

const EXTEND_PAGE_BATCH = 10;

export function DocumentPreview({
  documentId,
  version,
  taskId,
  onClose,
  onCapabilitiesChange,
}: {
  documentId: string;
  version: number;
  taskId?: string;
  onClose?: () => void;
  onCapabilitiesChange?: (capabilities: PreviewSession['capabilities']) => void;
}) {
  const [session, setSession] = useState<PreviewSession>();
  const [pages, setPages] = useState<PreviewPage[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [extending, setExtending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const sessionIdRef = useRef<string | undefined>(undefined);
  const objectUrlsRef = useRef<string[]>([]);

  const loadPages = useCallback(
    async (session: PreviewSession, fromPage: number, toPage: number) => {
      const next: PreviewPage[] = [];
      for (let page = fromPage; page <= toPage; page += 1) {
        const blob = await documentsApi.getPreviewPage(documentId, version, session.id, page);
        const url = URL.createObjectURL(blob);
        next.push({ page, url });
      }
      return next;
    },
    [documentId, version],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPreview(): Promise<void> {
      try {
        const created = await documentsApi.createPreviewSession(documentId, version, taskId);
        if (cancelled) return;
        sessionIdRef.current = created.id;
        setSession(created);
        onCapabilitiesChange?.(created.capabilities);

        const initial = await loadPages(created, 1, created.page_count);
        if (cancelled) {
          initial.forEach(({ url }) => URL.revokeObjectURL(url));
          return;
        }
        initial.forEach(({ url }) => objectUrlsRef.current.push(url));
        setPages(initial);
        if (!cancelled) setStatus('ready');
      } catch (reason: unknown) {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(previewErrorMessage(reason));
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
      if (sessionIdRef.current) {
        void documentsApi.revokePreviewSession(documentId, version, sessionIdRef.current);
      }
    };
  }, [documentId, loadPages, onCapabilitiesChange, taskId, version]);

  const renderMore = async (): Promise<void> => {
    if (!session || extending) return;
    setExtending(true);
    try {
      const fromPage = session.page_count + 1;
      const toPage = Math.min(session.total_pages, fromPage + EXTEND_PAGE_BATCH - 1);
      const extended = await documentsApi.extendPreviewSession(
        documentId,
        version,
        session.id,
        toPage,
      );
      const additional = await loadPages(session, fromPage, extended.page_count);
      additional.forEach(({ url }) => objectUrlsRef.current.push(url));
      setPages((current) => [...current, ...additional]);
      setSession((current) => (current ? { ...current, page_count: extended.page_count } : current));
    } catch (reason: unknown) {
      setErrorMessage(previewErrorMessage(reason));
    } finally {
      setExtending(false);
    }
  };

  if (status === 'error') {
    return (
      <section className={styles.previewPanel} role="alert">
        <h2>Không thể xem trước</h2>
        <p>{errorMessage}</p>
        {onClose && <button onClick={onClose}>Đóng xem trước</button>}
      </section>
    );
  }

  const hasMorePages = !!session && session.page_count < session.total_pages;

  return (
    <section
      className={styles.previewPanel}
      aria-busy={status === 'loading'}
      onContextMenu={(event) => event.preventDefault()}
    >
      <header className={styles.previewHeader}>
        <div>
          <h2>{session?.title || 'Xem trước an toàn'}</h2>
          <p>Các trang được render và đóng watermark trên server. File gốc không được phát trong luồng xem trước.</p>
        </div>
        {onClose && <button onClick={onClose}>Đóng xem trước</button>}
      </header>
      <div className={styles.previewWarning} aria-label="Cảnh báo chỉ xem trước">
        CHỈ XEM TRƯỚC — KHÔNG TẢI FILE GỐC
      </div>
      {status === 'loading' && <p role="status">Đang chuẩn bị các trang có watermark…</p>}
      <div className={styles.previewPages}>
        {pages.map(({ page, url }) => (
          <figure className={styles.previewPage} key={page}>
            <img src={url} alt={'Trang xem trước ' + page} draggable={false} />
            <figcaption>CHỈ XEM TRƯỚC · trang {page}</figcaption>
          </figure>
        ))}
      </div>
      {status === 'ready' && hasMorePages && (
        <div className={styles.previewMore}>
          <p>
            Đã hiển thị {pages.length}/{session?.total_pages} trang. Render thêm trang để tiếp tục.
          </p>
          <button onClick={() => void renderMore()} disabled={extending}>
            {extending ? 'Đang render thêm…' : 'Render thêm trang'}
          </button>
          {errorMessage && <p role="alert">{errorMessage}</p>}
        </div>
      )}
    </section>
  );
}

function previewErrorMessage(reason: unknown): string {
  if (reason instanceof GatewayError) {
    if (reason.status === 403) return 'Quyền xem trước đã hết hạn hoặc đã bị thu hồi.';
    if (reason.status === 422) return 'File này không thể được render an toàn để xem trước.';
    if (reason.status === 429) return 'Có quá nhiều yêu cầu xem trước. Hãy thử lại sau.';
  }
  return 'Không thể chuẩn bị bản xem trước an toàn. Hãy thử lại sau.';
}