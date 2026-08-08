'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from 'react';
import { documentsApi } from '@/api/documents';
import { GatewayError } from '@/lib/errors';
import type { PreviewSession } from '@/types/document';
import styles from './documents.module.css';

interface PreviewPage {
  page: number;
  url: string;
}

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
  const [errorMessage, setErrorMessage] = useState('');
  const sessionIdRef = useRef<string | undefined>(undefined);
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadPreview(): Promise<void> {
      try {
        const created = await documentsApi.createPreviewSession(documentId, version, taskId);
        if (cancelled) return;
        sessionIdRef.current = created.id;
        setSession(created);
        onCapabilitiesChange?.(created.capabilities);

        for (let page = 1; page <= created.page_count; page += 1) {
          const blob = await documentsApi.getPreviewPage(documentId, version, created.id, page);
          const url = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          objectUrlsRef.current.push(url);
          setPages((current) => [...current, { page, url }]);
        }
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
  }, [documentId, onCapabilitiesChange, taskId, version]);

  if (status === 'error') {
    return (
      <section className={styles.previewPanel} role="alert">
        <h2>Preview unavailable</h2>
        <p>{errorMessage}</p>
        {onClose && <button onClick={onClose}>Close preview</button>}
      </section>
    );
  }

  return (
    <section
      className={styles.previewPanel}
      aria-busy={status === 'loading'}
      onContextMenu={(event) => event.preventDefault()}
    >
      <header className={styles.previewHeader}>
        <div>
          <h2>{session?.title || 'Secure preview'}</h2>
          <p>Pages are rendered server-side. Original file download is disabled.</p>
        </div>
        {onClose && <button onClick={onClose}>Close preview</button>}
      </header>
      <div className={styles.previewWarning} aria-label="Preview only warning">
        PREVIEW ONLY — NO DOWNLOAD
      </div>
      {status === 'loading' && <p role="status">Preparing watermarked pages…</p>}
      <div className={styles.previewPages}>
        {pages.map(({ page, url }) => (
          <figure className={styles.previewPage} key={page}>
            <img src={url} alt={`Preview page ${page}`} draggable={false} />
            <figcaption>PREVIEW ONLY · page {page}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function previewErrorMessage(reason: unknown): string {
  if (reason instanceof GatewayError) {
    if (reason.status === 403) return 'Your preview permission has expired or was revoked.';
    if (reason.status === 422) return 'This file cannot be rendered safely for preview.';
    if (reason.status === 429) return 'Too many preview requests. Please try again later.';
  }
  return 'The secure preview could not be prepared.';
}
