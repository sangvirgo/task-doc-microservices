'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useState } from 'react';
import { adminApi } from '@/api/admin';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import { readSession } from '@/auth/session';
import type { ManagedUser } from '@/types/admin';
import { CAPABILITIES, type Capability } from '@/types/capability';
import styles from './admin.module.css';
import { SearchableSelect } from '@/components/searchable-select';

const capabilityClass: Record<Capability, string> = {
  ARCHIVE_SUBMIT: styles.capabilityTeal,
  ARCHIVE_RECEIVE: styles.capabilityPurple,
  DISPOSAL_APPROVE: styles.capabilityAmber,
};

const initials = (email: string) => email.split(/[.@_-]/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');

export function UsersPanel() {
  const session = readSession();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState('');
  const load = () => {
    setUsers(null);
    setFailed(false);
    adminApi.users().then(setUsers).catch(() => setFailed(true));
  };
  useEffect(load, []);

  if (session?.role !== 'ADMIN') return <PermissionDeniedState />;
  if (failed) return <ErrorState message="Không thể tải danh mục người dùng." onRetry={load} />;
  if (!users) return <LoadingState />;

  const change = async (action: () => Promise<unknown>, message: string) => {
    setStatus('Đang gửi yêu cầu…');
    try {
      await action();
      setStatus(message);
      load();
    } catch {
      setStatus('Máy chủ không chấp nhận thay đổi này.');
    }
  };

  const grant = (event: FormEvent<HTMLFormElement>, userId: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = String(new FormData(form).get('capability'));
    if (!CAPABILITIES.includes(value as Capability)) return;
    void change(() => adminApi.grantCapability(userId, value as Capability), 'Đã cấp quyền hệ thống.');
    form.reset();
  };

  return <section className={styles.usersPage}>
    <header className={styles.usersHeader}>
      <div>
        <h1>Người dùng &amp; quyền</h1>
        <p>Quản lý trạng thái tài khoản và quyền hệ thống của nhân sự.</p>
      </div>
      <span className={styles.userCount}>{users.length} người dùng</span>
    </header>
    {status && <p className={styles.statusMessage} role="status">{status}</p>}
    {users.length === 0 ? <EmptyState title="Chưa có người dùng">Máy chủ chưa trả về tài khoản nào.</EmptyState> : <div className={styles.userCards}>
      {users.map(user => <article className={`${styles.userCard} ${user.locked_at ? styles.lockedCard : ''}`} key={user.id}>
        <div className={styles.identityRow}>
          <span className={styles.userAvatar} aria-hidden="true">{initials(user.email)}</span>
          <div className={styles.userIdentity}>
            <strong>{user.email}</strong>
            <small>ID: {user.id}</small>
          </div>
          <span className={`${styles.accountState} ${user.locked_at ? styles.stateLocked : styles.stateActive}`}>
            <span aria-hidden="true" />{user.locked_at ? 'Đã khóa' : 'Hoạt động'}
          </span>
        </div>
        <div className={styles.cardMeta}>
          <span className={styles.rolePill}>{user.role}</span>
          <span>Tham gia {new Date(user.created_at).toLocaleDateString('vi-VN')}</span>
        </div>
        <div className={styles.capabilitySection}>
          <div className={styles.capabilityHeading}><h2>Quyền hệ thống</h2><span>{user.capabilities.length}</span></div>
          <div className={styles.chips}>
            {user.capabilities.length === 0 && <span className={styles.noCapability}>Chưa được cấp quyền</span>}
            {user.capabilities.map(cap => <span className={`${styles.capabilityChip} ${capabilityClass[cap]}`} key={cap}>
              {cap}
              <button type="button" aria-label={`Thu hồi ${cap}`} title={`Thu hồi ${cap}`} onClick={() => change(() => adminApi.revokeCapability(user.id, cap), 'Đã thu hồi quyền hệ thống.')}>×</button>
            </span>)}
          </div>
          {user.role !== 'ADMIN' && <form className={styles.capabilityForm} onSubmit={event => grant(event, user.id)}>
            <SearchableSelect name="capability" aria-label={`Quyền mới cho ${user.email}`} defaultValue="" required>
              <option value="" disabled>Chọn quyền cần cấp</option>
              {CAPABILITIES.filter(cap => !user.capabilities.includes(cap)).map(cap => <option key={cap} value={cap}>{cap}</option>)}
            </SearchableSelect>
            <button disabled={user.capabilities.length === CAPABILITIES.length}>+ Thêm</button>
          </form>}
        </div>
        <footer className={styles.cardFooter}>
          <span>{user.locked_at ? 'Tài khoản không thể đăng nhập' : 'Tài khoản đang được phép truy cập'}</span>
          <button className={user.locked_at ? styles.unlockButton : styles.lockButton} onClick={() => change(() => user.locked_at ? adminApi.unlock(user.id) : adminApi.lock(user.id), user.locked_at ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.')}>
            {user.locked_at ? 'Mở khóa' : 'Khóa tài khoản'}
          </button>
        </footer>
      </article>)}
    </div>}
  </section>;
}