'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { grantsApi } from '@/api/grants';
import { readSession } from '@/auth/session';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import type { Grant } from '@/types/grant';
import styles from './grants.module.css';

const when = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not revoked';
export function GrantDetail({ id }: { id: string }) {
  const session = readSession(); const [grant, setGrant] = useState<Grant | null>(null); const [error, setError] = useState(false); const [message, setMessage] = useState('');
  const load = () => { setGrant(null); setError(false); grantsApi.get(id).then(setGrant).catch(() => setError(true)); }; useEffect(load, [id]);
  if (session?.role === 'ADMIN') return <PermissionDeniedState />;
  if (error) return <ErrorState message="This grant could not be loaded." onRetry={load} />; if (!grant) return <LoadingState />;
  const delegate = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const permissions = String(form.get('permissions')).split(',').map(value => value.trim()).filter(Boolean); setMessage('Submitting delegation…'); try { const result = await grantsApi.delegate(grant.id, String(form.get('actor_id')), permissions.length ? permissions : undefined); setMessage(`Delegation ${result.status.toLowerCase()} on the server.`); load(); } catch { setMessage('Delegation was not accepted by the server.'); } };
  const revoke = async () => { const reason = window.prompt('Optional revocation reason') ?? undefined; setMessage('Revoking grant…'); try { const result = await grantsApi.revoke(grant.id, reason); setGrant(result); setMessage(`Server returned ${result.status.toLowerCase()}.`); } catch { setMessage('Revocation was not accepted by the server.'); } };
  return <section><div className={styles.head}><div><Link href="/grants">← Grants</Link><h1>Grant detail</h1></div></div><p className={styles.notice}>Status, effective expiry, and revocation values are server results. They are not calculated in this browser.</p><dl className={styles.detail}><dt>Resource</dt><dd>{grant.resource_type}</dd><dt>Permissions</dt><dd>{grant.permissions.join(', ')}</dd><dt>Status</dt><dd>{grant.status}</dd><dt>Requested expiry</dt><dd>{when(grant.expires_at)}</dd><dt>Effective expiry</dt><dd>{when(grant.effective_expires_at)}</dd><dt>Revoked at</dt><dd>{when(grant.revoked_at)}</dd><dt>Parent grant</dt><dd>{grant.parent_grant_id ?? 'None'}</dd></dl><form className={styles.form} onSubmit={delegate}><h2>Delegate grant</h2><label>Recipient employee ID<input name="actor_id" required /></label><label>Permissions (optional, comma separated)<input name="permissions" /></label><div className={styles.actions}><button>Delegate</button><button type="button" onClick={revoke} disabled={grant.revoked_at !== null || grant.status !== 'ACTIVE'}>Revoke grant</button>{message && <p role="status">{message}</p>}</div></form>{grant.status !== 'ACTIVE' && <EmptyState title="No active grant actions">The server returned this grant as {grant.status.toLowerCase()}.</EmptyState>}</section>;
}
