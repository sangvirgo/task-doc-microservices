'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from 'react';
import { auditApi } from '@/api/audit';
import { readSession } from '@/auth/session';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import type { AuditEventMetadata } from '@/types/audit';
import styles from './admin.module.css';

export function AuditPanel() {
  const session = readSession(); const [events, setEvents] = useState<AuditEventMetadata[] | null>(null); const [failed, setFailed] = useState(false); const [status, setStatus] = useState('');
  const load = () => { setEvents(null); setFailed(false); auditApi.events().then(setEvents).catch(() => setFailed(true)); };
  useEffect(load, []);
  if (session?.role !== 'ADMIN') return <PermissionDeniedState />;
  if (failed) return <ErrorState message="Audit metadata could not be loaded." onRetry={load} />;
  if (!events) return <LoadingState />;
  const verify = async () => { try { const result = await auditApi.verify(); setStatus(result.valid ? 'The server reports an intact audit chain.' : `The server reports a chain break at sequence ${result.broken_at ?? 'unknown'}.`); } catch { setStatus('The server could not verify the audit chain.'); } };
  return <section><h1>Siêu dữ liệu kiểm toán</h1><p className={styles.notice}>ADMIN-only. This read-only screen deliberately excludes audit payloads, hashes, actor IDs and resource IDs. It cannot append audit events.</p><button onClick={() => void verify()}>Verify chain integrity</button>{status && <p role="status">{status}</p>}<h2>Recent events</h2>{events.length === 0 ? <EmptyState title="No audit metadata found">The server did not return any events.</EmptyState> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Sequence</th><th>Event type</th><th>Resource type</th><th>Occurred</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{event.sequence_number}</td><td>{event.event_type}</td><td>{event.resource_type}</td><td>{new Date(event.occurred_at).toLocaleString()}</td></tr>)}</tbody></table></div>}</section>;
}
