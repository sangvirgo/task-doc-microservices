'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { readSession } from './session';
import { LoadingState } from '@/components/common-states';
import { AppShell } from '@/components/app-shell';
import type { SessionRecord } from '@/types/auth';

const subscribeToHydration = () => () => undefined;

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const session: SessionRecord | null = hydrated ? readSession() : null;
  useEffect(() => { if (hydrated && !session) router.replace(`/login?next=${encodeURIComponent(pathname)}`); }, [hydrated, pathname, router, session]);
  if (!hydrated || !session) return <LoadingState />;
  return <AppShell session={session}>{children}</AppShell>;
}
