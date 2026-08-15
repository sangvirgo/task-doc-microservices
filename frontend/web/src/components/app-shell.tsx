'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authApi } from '@/api/auth';
import { adminApi } from '@/api/admin';
import { documentsApi } from '@/api/documents';
import { notificationsApi } from '@/api/notifications';
import { tasksApi } from '@/api/tasks';
import { clearSession } from '@/auth/session';
import type { ManagedUser } from '@/types/admin';
import type { Document as WorkspaceDocument } from '@/types/document';
import type { SessionRecord } from '@/types/auth';
import type { Task } from '@/types/task';
import { NetworkBanner } from './network-banner';
import styles from './app-shell.module.css';

type SearchItem = {
  kind: 'task' | 'document' | 'user';
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const SEARCH_CACHE_TTL_MS = 60_000;
const searchCache = new Map<SessionRecord['role'], { items: SearchItem[]; expiresAt: number }>();
const searchRequests = new Map<SessionRecord['role'], Promise<SearchItem[]>>();

const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();

const loadSearchIndex = (scope: SessionRecord['role']) => {
  const cached = searchCache.get(scope);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.items);
  const pending = searchRequests.get(scope);
  if (pending) return pending;

  const request = Promise.allSettled([
    tasksApi.list(),
    documentsApi.list(),
    scope === 'ADMIN' ? adminApi.users() : Promise.resolve([] as ManagedUser[]),
  ]).then(([taskResult, documentResult, userResult]) => {
    const items: SearchItem[] = [];
    if (taskResult.status === 'fulfilled') {
      items.push(...taskResult.value.map((task: Task) => ({
        kind: 'task' as const,
        id: task.id,
        title: task.title,
        subtitle: `Công việc · ${task.status}`,
        href: `/tasks/${task.id}`,
      })));
    }
    if (documentResult.status === 'fulfilled') {
      items.push(...documentResult.value.map((document: WorkspaceDocument) => ({
        kind: 'document' as const,
        id: document.id,
        title: document.title,
        subtitle: `Tài liệu · ${document.document_type}`,
        href: `/documents/${document.id}`,
      })));
    }
    if (userResult.status === 'fulfilled') {
      items.push(...userResult.value.map((user: ManagedUser) => ({
        kind: 'user' as const,
        id: user.id,
        title: user.email,
        subtitle: `Người dùng · ${user.role}`,
        href: '/admin/users',
      })));
    }
    searchCache.set(scope, { items, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
    return items;
  }).finally(() => {
    if (searchRequests.get(scope) === request) searchRequests.delete(scope);
  });
  searchRequests.set(scope, request);
  return request;
};

export function AppShell({ session, children }: { session: SessionRecord; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/workspace';
  const [accountEmail, setAccountEmail] = useState(session.userId ?? '');
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

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
  }, [session.role, session.userId]);

  useEffect(() => {
    const query = normalizeSearch(searchQuery);
    if (query.length < 2) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      void loadSearchIndex(session.role)
        .then(items => {
          if (!cancelled) setSearchResults(items.filter(item => normalizeSearch(`${item.title} ${item.subtitle}`).includes(query)).slice(0, 8));
        })
        .catch(() => { if (!cancelled) setSearchResults([]); })
        .finally(() => { if (!cancelled) setSearchLoading(false); });
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [searchQuery, session.role]);

  const signOut = async () => { try { await authApi.logout(session.refresh_token); } catch { /* local clearance remains required */ } finally { clearSession(); router.replace('/login'); } };
  const clearSearch = () => { setSearchQuery(''); setSearchResults([]); setSearchOpen(false); };
  const navItems = session.role === 'ADMIN'
    ? [['Tổng quan', '/workspace', '◈'], ['Người dùng & quyền', '/admin/users', '♙'], ['Giám sát', '/admin/monitoring', '◉'], ['Siêu dữ liệu kiểm toán', '/admin/audit', '▤']]
    : [['Tổng quan', '/workspace', '◈'], ['Công việc', '/tasks', '✓'], ['Tài liệu', '/documents', '▧'], ['Quyền tài liệu', '/grants', '⌘'], ['Thông báo', '/notifications', '◌']];

  return <div className={styles.frame}><NetworkBanner /><div className={styles.grid}>
    <aside className={styles.sidebar} aria-label="Điều hướng chính"><div className={styles.sidebarInner}><Link className={styles.brand} href="/workspace"><span className={styles.brandMark}>C</span><span><strong>C17 Workspace</strong><small>Cộng tác bảo mật</small></span></Link><nav aria-label="Các khu vực trong không gian làm việc"><p className={styles.sectionLabel}>{session.role === 'ADMIN' ? 'Hệ thống' : 'Không gian làm việc'}</p>{navItems.map(([label, href, icon]) => <Link aria-label={label === 'Tổng quan' && session.role === 'ADMIN' ? 'Overview' : label} key={href} className={[styles.navItem, pathname === href || (href !== '/workspace' && pathname.startsWith(href + '/')) ? styles.active : ''].filter(Boolean).join(' ')} href={href}><span className={styles.navIcon}>{icon}</span><span>{label}</span>{label === 'Thông báo' && unreadCount > 0 && <span className={styles.navCount}>{unreadCount}</span>}</Link>)}</nav><div className={styles.sidebarSpacer} /><div className={styles.securityNote}><span className={styles.securityIcon}>✓</span><span><strong>Không gian an toàn</strong><small>Hoạt động được ghi nhật ký kiểm toán.</small></span></div></div></aside>
    <div className={styles.main}><header className={styles.topbar}><div className={styles.topbarRight}>
      <div className={styles.searchWrap}>
        <label className={styles.search}><span>⌕</span><input aria-label="Tìm kiếm không gian làm việc" placeholder="Tìm nhanh" value={searchQuery} onFocus={() => setSearchOpen(true)} onChange={event => { setSearchQuery(event.target.value); setSearchOpen(true); }} onKeyDown={event => { if (event.key === 'Escape') clearSearch(); }} /><kbd>⌘ K</kbd></label>
        {searchOpen && searchQuery.trim().length >= 2 && <div className={styles.searchResults} role="listbox" aria-label="Kết quả tìm kiếm">
          {searchLoading ? <p className={styles.searchEmpty}>Đang tìm kiếm…</p> : searchResults.length > 0 ? searchResults.map(item => <Link className={styles.searchResult} href={item.href} key={item.id} onClick={clearSearch}><span className={styles.searchResultIcon}>{item.kind === 'task' ? '✓' : item.kind === 'document' ? '▧' : '♙'}</span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span></Link>) : <p className={styles.searchEmpty}>Không tìm thấy kết quả phù hợp.</p>}
        </div>}
      </div>
      <button className={styles.iconButton} aria-label="Thông báo">◌</button><div className={styles.account}><span className={styles.avatar}>{session.role === 'ADMIN' ? 'A' : 'E'}</span><span className={styles.accountCopy}><strong>{session.role === 'ADMIN' ? <>Quản trị viên <span>Administrator</span></> : accountEmail || 'Employee'}</strong><small>{session.role}</small></span><button className={styles.signOut} onClick={signOut}>Đăng xuất</button></div>
    </div></header><main id="main-content" className={styles.content}>{children}</main></div>
  </div></div>;
}
