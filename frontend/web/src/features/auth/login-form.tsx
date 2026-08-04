'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/api/auth';
import { writeSession } from '@/auth/session';
import { GatewayError } from '@/lib/errors';
import styles from './login-form.module.css';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(params.get('reason') === 'session-expired' ? 'Your session expired. Sign in again.' : null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setPending(true); setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? ''); const password = String(form.get('password') ?? '');
    try {
      if (mode === 'register') { await authApi.register(email, password); setMode('login'); setError('Account created. Sign in to continue.'); return; }
      const tokens = await authApi.login(email, password); writeSession(tokens); const next = params.get('next'); router.replace(next?.startsWith('/') ? next : '/workspace');
    } catch (caught) { setError(caught instanceof GatewayError ? caught.message : mode === 'register' ? 'Unable to create the account. Try again.' : 'Unable to sign in. Try again.'); }
    finally { setPending(false); }
  };
  return <section className={styles.card} aria-labelledby="login-title"><p className={styles.product}>C17 Workspace</p><h1 id="login-title">{mode === 'login' ? 'Sign in' : 'Create your account'}</h1><p className={styles.copy}>{mode === 'login' ? 'Use your organization account to continue.' : 'Join the workspace with an employee account.'}</p><form onSubmit={submit} noValidate>
    <label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required disabled={pending} />
    <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required disabled={pending} />
    {error && <p className={styles.error} role="alert">{error}</p>}
    <button type="submit" disabled={pending}>{pending ? 'Please wait?' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
  </form><button className={styles.switch} type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button></section>;
}
