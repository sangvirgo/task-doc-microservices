'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useState } from 'react';
import { adminApi } from '@/api/admin';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import { readSession } from '@/auth/session';
import type { ManagedUser } from '@/types/admin';
import styles from './admin.module.css';

const roleLabel: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  EMPLOYEE: 'Nhân viên',
};

const initials = (email: string) => email.split(/[.@_-]/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');

export function UsersPanel() {
  const session = readSession();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatingOpen, setCreatingOpen] = useState(false);
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

  const createAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get('email')).trim();
    const password = String(new FormData(form).get('password'));
    if (!email || password.length < 8) {
      setStatus('Email không hợp lệ hoặc mật khẩu phải có ít nhất 8 ký tự.');
      return;
    }
    setCreating(true);
    adminApi.adminRegister(email, password)
      .then(() => { setStatus('Đã tạo tài khoản nhân viên. Nhân viên có thể đăng nhập bằng mật khẩu này.'); form.reset(); setCreatingOpen(false); load(); })
      .catch(() => setStatus('Không thể tạo tài khoản. Email có thể đã được dùng.'))
      .finally(() => setCreating(false));
  };

  return <section className={styles.usersPage}>
    <header className={styles.usersHero}>
      <div>
        <span className={styles.heroEyebrow}>QUẢN LÝ TRUY CẬP</span>
        <h1>Người dùng</h1>
        <p>Quản lý tài khoản và trạng thái truy cập của nhân sự.</p>
      </div>
      <span className={styles.userCount}>{users.length} người dùng</span>
    </header>



    <div className={styles.createUserToggle}>
      <button className={styles.createUserOpenButton} type="button" aria-expanded={creatingOpen} onClick={() => setCreatingOpen(current => !current)}>
        {creatingOpen ? '− Ẩn biểu mẫu' : '+ Tạo tài khoản nhân viên'}
      </button>
      {creatingOpen && <form className={styles.createUserForm} onSubmit={createAccount}>
        <div className={styles.createUserFields}>
          <label>Email công việc<input name="email" type="email" required autoComplete="off" placeholder="nhan.vien@congty.vn" /></label>
          <label>Mật khẩu ban đầu<input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Ít nhất 8 ký tự" /></label>
          <button className={styles.createUserButton} type="submit" disabled={creating}>{creating ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
        </div>
      </form>}
    </div>

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
          <span className={styles.rolePill}>{roleLabel[user.role] ?? user.role}</span>
          <span>Tham gia {new Date(user.created_at).toLocaleDateString('vi-VN')}</span>
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
