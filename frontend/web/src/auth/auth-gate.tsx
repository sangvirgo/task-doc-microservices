'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { readSession } from './session';
import { LoadingState } from '@/components/common-states';
import { AppShell } from '@/components/app-shell';
import type { SessionRecord } from '@/types/auth';

const subscribeToHydration = () => () => undefined;
const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const demoSession: SessionRecord = { access_token: 'demo-access-token', refresh_token: 'demo-refresh-token', expires_in_seconds: 86400, role: 'EMPLOYEE', userId: 'demo-user', expiresAt: Date.now() + 86400000 };

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const session: SessionRecord | null = hydrated ? (demoMode ? demoSession : readSession()) : null;
  useEffect(() => { if (hydrated && !session) router.replace(`/login?next=${encodeURIComponent(pathname)}`); }, [hydrated, pathname, router, session]);
  if (!hydrated || !session) return <LoadingState />;
  return <AppShell session={session}>{children}</AppShell>;
}
