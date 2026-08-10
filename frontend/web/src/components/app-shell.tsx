'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authApi } from '@/api/auth';
import { adminApi } from '@/api/admin';
import { notificationsApi } from '@/api/notifications';
import { clearSession } from '@/auth/session';
import { NetworkBanner } from './network-banner';
import styles from './app-shell.module.css';
import type { SessionRecord } from '@/types/auth';

export function AppShell({ session, children }: { session: SessionRecord; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/workspace';
  const [accountEmail, setAccountEmail] = useState(session.userId ?? '');
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const loadHeaderData = async () => {
      try {
        const [members, unread] = await Promise.all([
          adminApi.directory(),
          session.role === 'EMPLOYEE' && session.userId ? notificationsApi.list(session.userId, true) : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setAccountEmail(members.find(member => member.id === session.userId)?.email ?? session.userId ?? 'Employee');
          setUnreadCount(unread.length);
        }
      } catch {
        if (!cancelled) { setAccountEmail(session.userId ?? 'Employee'); setUnreadCount(0); }
      }
    };
    void loadHeaderData();
    const timer = window.setInterval(() => void loadHeaderData(), 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [session.role, session.userId, pathname]);
  const signOut = async () => { try { await authApi.logout(session.refresh_token); } catch { /* local clearance remains required */ } finally { clearSession(); router.replace('/login'); } };
  const navItems = session.role === 'ADMIN'
    ? [['Tổng quan', '/workspace', '◈'], ['Người dùng & quyền', '/admin/users', '♙'], ['Giám sát', '/admin/monitoring', '◉'], ['Siêu dữ liệu kiểm toán', '/admin/audit', '▤']]
    : [['Tổng quan', '/workspace', '◈'], ['Công việc', '/tasks', '✓'], ['Tài liệu', '/documents', '▧'], ['Quyền tài liệu', '/grants', '⌘'], ['Thông báo', '/notifications', '◌'], ['Hồ sơ', '/records', '▦'], ['Gói chuyển giao', '/transfer-packages', '⇄'], ['Lưu giữ & hủy', '/retention-disposal', '⌁']];
  return <div className={styles.frame}><NetworkBanner /><div className={styles.grid}>
    <aside className={styles.sidebar} aria-label="Điều hướng chính"><div className={styles.sidebarInner}><Link className={styles.brand} href="/workspace"><span className={styles.brandMark}>C</span><span><strong>C17 Workspace</strong><small>Cộng tác bảo mật</small></span></Link><nav aria-label="Các khu vực trong không gian làm việc"><p className={styles.sectionLabel}>{session.role === 'ADMIN' ? 'Hệ thống' : 'Không gian làm việc'}</p>{navItems.map(([label, href, icon]) => <Link aria-label={label === 'Tổng quan' ? 'Overview' : label} key={href} className={`${styles.navItem} ${pathname === href || (href !== '/workspace' && pathname.startsWith(`${href}/`)) ? styles.active : ''}`} href={href}><span className={styles.navIcon}>{icon}</span><span>{label}</span>{label === 'Thông báo' && unreadCount > 0 && <span className={styles.navCount}>{unreadCount}</span>}</Link>)}</nav><div className={styles.sidebarSpacer} /><div className={styles.securityNote}><span className={styles.securityIcon}>✓</span><span><strong>Không gian an toàn</strong><small>Hoạt động được ghi nhật ký kiểm toán.</small></span></div></div></aside>
    <div className={styles.main}><header className={styles.topbar}><div className={styles.topbarRight}><button className={styles.iconButton} aria-label="Thông báo">◌</button><div className={styles.account}><span className={styles.avatar}>{session.role === 'ADMIN' ? 'A' : 'E'}</span><span className={styles.accountCopy}><strong>{session.role === 'ADMIN' ? <>Quản trị viên <span>Administrator</span></> : accountEmail || 'Employee'}</strong><small>{session.role}</small></span><button className={styles.signOut} onClick={signOut}>Đăng xuất</button></div></div></header><main id="main-content" className={styles.content}>{children}</main></div>
  </div></div>;
}
