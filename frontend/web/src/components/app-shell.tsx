'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/api/auth';
import { clearSession } from '@/auth/session';
import { NetworkBanner } from './network-banner';
import styles from './app-shell.module.css';
import type { SessionRecord } from '@/types/auth';

export function AppShell({ session, children }: { session: SessionRecord; children: React.ReactNode }) {
  const router = useRouter();
  const signOut = async () => { try { await authApi.logout(session.refresh_token); } catch { /* local clearance remains required */ } finally { clearSession(); router.replace('/login'); } };
  return <div className={styles.frame}><NetworkBanner /><div className={styles.grid}>
    <aside className={styles.sidebar} aria-label="Primary navigation"><Link className={styles.brand} href="/workspace"><span className={styles.brandMark} aria-hidden="true">C</span><span><strong>C17 Workspace</strong><small>Secure work environment</small></span></Link><nav aria-label="Workspace sections"><p className={styles.sectionLabel}>Workspace</p><Link className={styles.navItem} href="/workspace">Overview</Link>{session.role === 'ADMIN' ? <><Link className={styles.navItem} href="/admin/users">Users & capabilities</Link><Link className={styles.navItem} href="/admin/monitoring">Monitoring</Link><Link className={styles.navItem} href="/admin/audit">Audit metadata</Link></> : <><Link className={styles.navItem} href="/tasks">Tasks</Link><Link className={styles.navItem} href="/documents">Documents</Link><Link className={styles.navItem} href="/grants">Grants</Link><Link className={styles.navItem} href="/notifications">Notifications</Link><Link className={styles.navItem} href="/records">Records</Link><Link className={styles.navItem} href="/transfer-packages">Transfer packages</Link><Link className={styles.navItem} href="/retention-disposal">Retention & disposal</Link></>}</nav><p className={styles.note}>Content access is always confirmed by the service.</p></aside>
    <div className={styles.main}><header className={styles.topbar}><div><p className={styles.breadcrumb}>Workspace</p><h1>Workspace</h1></div><div className={styles.account}><span className={styles.roleBadge}>{session.role === 'ADMIN' ? 'Administrator' : 'Employee'}</span><button onClick={signOut}>Sign out</button></div></header><main id="main-content" className={styles.content}>{children}</main></div>
  </div></div>;
}
