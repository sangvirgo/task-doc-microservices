'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/api/auth';
import { writeSession } from '@/auth/session';
import { GatewayError } from '@/lib/errors';
import styles from './login-form.module.css';

const loginErrorMessage = (error: unknown) => {
  if (!(error instanceof GatewayError)) return 'Không thể đăng nhập (Unable to sign in). Vui lòng thử lại.';
  if (error.status === 401 && error.message === 'Account is locked') return 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị hệ thống để mở khóa.';
  if (error.status === 401) return 'Email hoặc mật khẩu không đúng.';
  return error.message;
};

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(params.get('reason') === 'session-expired' ? 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.' : null);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');
    if (mode === 'register' && password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp. Vui lòng nhập lại.');
      setPending(false);
      return;
    }
    try {
      if (mode === 'register') {
        await authApi.register(email, password);
        setMode('login');
        setError('Đã tạo tài khoản. Đăng nhập để tiếp tục.');
        return;
      }
      const tokens = await authApi.login(email, password);
      writeSession(tokens);
      const next = params.get('next');
      router.replace(next?.startsWith('/') ? next : '/workspace');
    } catch (caught) {
      setError(mode === 'register' && !(caught instanceof GatewayError) ? 'Không thể tạo tài khoản. Vui lòng thử lại.' : loginErrorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <main className={styles.authLayout}>
      <section className={styles.storyPanel} aria-label="Giới thiệu C17 Workspace">
        <div className={styles.storyGlow} aria-hidden="true" />
        <div className={styles.brandLockup}>
          <span className={styles.slackMark} aria-hidden="true"><i /><i /><i /><i /></span>
          <span className={styles.brandName}>C17 Workspace</span>
        </div>
        <div className={styles.storyContent}>
          <p className={styles.kicker}>Một nơi làm việc gọn gàng cho mọi nhóm</p>
          <h2>Cùng nhau hoàn thành công việc.</h2>
          <p>Điều phối công việc, tài liệu và quyết định trong một không gian bảo mật.</p>
        </div>
        <div className={styles.storyFooter}>
          <span className={styles.statusDot} /> Không gian an toàn <span>•</span> Hoạt động được kiểm toán
        </div>
      </section>
      <section className={styles.card} aria-labelledby="login-title">
        <div className={styles.cardHeading}>
          <p className={styles.eyebrow}>{mode === 'login' ? 'Chào mừng trở lại' : 'Bắt đầu ngay'}</p>
          <h1 id="login-title">{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</h1>
          <p className={styles.copy}>{mode === 'login' ? 'Dùng tài khoản tổ chức để tiếp tục.' : 'Tham gia không gian làm việc bằng tài khoản nhân viên.'}</p>
        </div>
        <form onSubmit={submit} noValidate>
          <label htmlFor="email">Địa chỉ email
            <input aria-label="Email address" id="email" name="email" type="email" autoComplete="email" required disabled={pending} placeholder="ban@congty.com" />
          </label>
          <label htmlFor="password">Mật khẩu
            <span className={styles.passwordField}>
              <input aria-label="Password" id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required disabled={pending} placeholder="Nhập mật khẩu" />
              <button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} className={styles.togglePassword} onClick={() => setShowPassword((value) => !value)} disabled={pending}>
                {showPassword ? <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg> : <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
              </button>
            </span>
          </label>
          {mode === 'register' && (
            <label htmlFor="confirmPassword">Xác nhận mật khẩu
              <input aria-label="Confirm password" id="confirmPassword" name="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required disabled={pending} placeholder="Nhập lại mật khẩu" />
            </label>
          )}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button aria-label={mode === 'login' ? 'Sign in' : 'Create account'} className={styles.submit} type="submit" disabled={pending}>{pending ? 'Vui lòng chờ…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}<span aria-hidden="true">→</span></button>
        </form>
        <div className={styles.divider}><span>Truy cập bảo mật</span></div>
        <p className={styles.securityNote}><span className={styles.lockIcon} aria-hidden="true">⌁</span> Hoạt động trong không gian của bạn được bảo vệ và kiểm toán.</p>
        <button className={styles.switch} type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>{mode === 'login' ? 'Chưa có tài khoản? Tạo tài khoản' : 'Đã có tài khoản? Đăng nhập'}</button>
      </section>
    </main>
  );
}
