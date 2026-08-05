'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '@/api/auth';
import { clearSession } from '@/auth/session';
import { NetworkBanner } from './network-banner';
import styles from './app-shell.module.css';
import type { SessionRecord } from '@/types/auth';

export function AppShell({ session, children }: { session: SessionRecord; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/workspace';
  const signOut = async () => { try { await authApi.logout(session.refresh_token); } catch { /* local clearance remains required */ } finally { clearSession(); router.replace('/login'); } };
  const navItems = session.role === 'ADMIN' ? [['Overview','/workspace','◈'],['Users & capabilities','/admin/users','♙'],['Monitoring','/admin/monitoring','◉'],['Audit metadata','/admin/audit','▤']] : [['Overview','/workspace','◈'],['Tasks','/tasks','✓'],['Documents','/documents','▧'],['Grants','/grants','⌘'],['Notifications','/notifications','◌'],['Records','/records','▦'],['Transfer packages','/transfer-packages','⇄'],['Retention & disposal','/retention-disposal','⌁']];
  const currentLabel = navItems.find(([, href]) => pathname === href || (href !== '/workspace' && pathname.startsWith(`${href}/`)))?.[0] ?? 'Workspace';
  return <div className={styles.frame}><NetworkBanner /><div className={styles.grid}>
    <aside className={styles.sidebar} aria-label="Primary navigation"><div className={styles.sidebarInner}><Link className={styles.brand} href="/workspace"><span className={styles.brandMark}>C</span><span><strong>C17 Workspace</strong><small>Secure collaboration</small></span></Link><div className={styles.workspaceSwitcher}><span className={styles.workspaceDot}>C</span><span><small>Workspace</small><strong>Product & Operations</strong></span><span className={styles.chevron}>⌄</span></div><nav aria-label="Workspace sections"><p className={styles.sectionLabel}>Workspace</p>{navItems.map(([label, href, icon]) => <Link key={href} className={`${styles.navItem} ${pathname === href || (href !== '/workspace' && pathname.startsWith(`${href}/`)) ? styles.active : ''}`} href={href}><span className={styles.navIcon}>{icon}</span><span>{label}</span>{label === 'Notifications' && <span className={styles.navCount}>3</span>}</Link>)}</nav><div className={styles.sidebarSpacer} /><div className={styles.securityNote}><span className={styles.securityIcon}>✓</span><span><strong>Secure workspace</strong><small>Activity is audit logged.</small></span></div></div></aside>
    <div className={styles.main}><header className={styles.topbar}><div className={styles.topbarLeft}><div className={styles.mobileBrand}><span className={styles.brandMark}>C</span></div><div><p className={styles.breadcrumb}>Workspace <span>/</span> {currentLabel}</p><h1>{currentLabel}</h1></div></div><div className={styles.topbarRight}><label className={styles.search}><span>⌕</span><input aria-label="Search workspace" placeholder="Search workspace" /><kbd>⌘ K</kbd></label><button className={styles.iconButton} aria-label="Notifications">◌</button><div className={styles.account}><span className={styles.avatar}>{session.role === 'ADMIN' ? 'A' : 'E'}</span><span className={styles.accountCopy}><strong>{session.role === 'ADMIN' ? 'Administrator' : 'Employee'}</strong><small>{session.role}</small></span><button className={styles.signOut} onClick={signOut}>Sign out</button></div></div></header><main id="main-content" className={styles.content}>{children}</main></div>
  </div></div>;
}

