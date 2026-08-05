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
  return <main className={styles.authLayout}>
    <section className={styles.storyPanel} aria-label="C17 Workspace introduction">
      <div className={styles.storyGlow} aria-hidden="true" />
      <div className={styles.brandLockup}>
        <span className={styles.slackMark} aria-hidden="true"><i /><i /><i /><i /></span>
        <span className={styles.brandName}>C17 Workspace</span>
      </div>
      <div className={styles.storyContent}>
        <p className={styles.kicker}>One calm place for busy teams</p>
        <h2>Move work forward, together.</h2>
        <p>Coordinate tasks, documents and decisions in one secure workspace built for your team.</p>
      </div>
      <div className={styles.storyFooter}><span className={styles.statusDot} /> Secure workspace <span>•</span> Activity is audit-ready</div>
    </section>
    <section className={styles.card} aria-labelledby="login-title">
      <div className={styles.cardHeading}>
        <p className={styles.eyebrow}>{mode === 'login' ? 'Welcome back' : 'Get started'}</p>
        <h1 id="login-title">{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
        <p className={styles.copy}>{mode === 'login' ? 'Use your organization account to continue.' : 'Join the workspace with an employee account.'}</p>
      </div>
      <form onSubmit={submit} noValidate>
        <label htmlFor="email">Email address<input id="email" name="email" type="email" autoComplete="email" required disabled={pending} placeholder="you@company.com" /></label>
        <label htmlFor="password">Password<input id="password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required disabled={pending} placeholder="Enter your password" /></label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.submit} type="submit" disabled={pending}>{pending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}<span aria-hidden="true">→</span></button>
      </form>
      <div className={styles.divider}><span>Secure access</span></div>
      <p className={styles.securityNote}><span className={styles.lockIcon} aria-hidden="true">⌁</span> Your workspace activity is protected and audit-ready.</p>
      <button className={styles.switch} type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
    </section>
  </main>;
}
