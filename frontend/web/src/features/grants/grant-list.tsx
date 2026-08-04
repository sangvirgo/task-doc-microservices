'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { grantsApi } from '@/api/grants';
import { readSession } from '@/auth/session';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import type { Grant } from '@/types/grant';
import styles from './grants.module.css';

const formatTime = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not revoked';

export function GrantList() {
  const session = readSession(); const [grants, setGrants] = useState<Grant[] | null>(null); const [error, setError] = useState(false); const [status, setStatus] = useState('');
  const load = () => { if (!session?.userId) return; setGrants(null); setError(false); grantsApi.list(session.userId).then(setGrants).catch(() => setError(true)); };
  useEffect(load, [session?.userId]);
  if (session?.role === 'ADMIN') return <PermissionDeniedState />;
  if (!session?.userId) return <ErrorState message="A session identity hint is unavailable. Please sign in again." />;
  const userId = session.userId;
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const permissions = String(form.get('permissions')).split(',').map(value => value.trim()).filter(Boolean); setStatus('Creating grant…'); try { const created = await grantsApi.create({ grantor_id: userId, actor_id: String(form.get('actor_id')), resource_type: String(form.get('resource_type')), resource_id: String(form.get('resource_id')), task_id: String(form.get('task_id')), permissions, expires_at: new Date(String(form.get('expires_at'))).toISOString() }); setStatus(`Grant ${created.status.toLowerCase()} from the server.`); event.currentTarget.reset(); load(); } catch { setStatus('Grant was not accepted by the server.'); } };
  if (error) return <ErrorState message="Grants could not be loaded. The server remains authoritative for access decisions." onRetry={load} />;
  if (!grants) return <LoadingState />;
  return <section><div className={styles.head}><div><h1>Grants</h1><p>Expiry and status are shown exactly as returned by the server.</p></div></div><p className={styles.notice}>This backend currently accepts grantor and actor IDs from the request and has no controller ownership guard. This interface uses your JWT subject only as a UX hint; it does not authorize a grant.</p><form className={styles.form} onSubmit={create}><h2>Create grant</h2><label>Recipient employee ID<input name="actor_id" required /></label><label>Resource type<input name="resource_type" required defaultValue="DOCUMENT" /></label><label>Resource ID<input name="resource_id" required /></label><label>Task ID<input name="task_id" required /></label><label>Permissions (comma separated)<input name="permissions" required /></label><label>Requested expiry<input name="expires_at" type="datetime-local" required /></label><div className={styles.actions}><button>Create grant</button>{status && <p role="status">{status}</p>}</div></form>{grants.length === 0 ? <EmptyState title="No grants found">Grants associated with this session hint will appear here.</EmptyState> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Resource</th><th>Status</th><th>Effective expiry</th><th>Revoked</th></tr></thead><tbody>{grants.map(grant => <tr key={grant.id}><td><Link href={`/grants/${grant.id}`}>{grant.resource_type}</Link></td><td>{grant.status}</td><td>{formatTime(grant.effective_expires_at)}</td><td>{formatTime(grant.revoked_at)}</td></tr>)}</tbody></table></div>}</section>;
}
