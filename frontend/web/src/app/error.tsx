'use client';
import { ErrorState } from '@/components/common-states';
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <ErrorState message="The workspace could not be loaded." onRetry={reset} />; }
