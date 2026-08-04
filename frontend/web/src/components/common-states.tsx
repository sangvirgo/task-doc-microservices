import styles from './common-states.module.css';

export function PageState({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className={styles.state} aria-live="polite"><h1>{title}</h1><p>{children}</p>{action}</section>;
}

export function LoadingState() { return <PageState title="Loading workspace">Preparing your session…</PageState>; }
export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) { return <PageState title={title}>{children}</PageState>; }
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) { return <PageState title="Something went wrong" action={onRetry ? <button onClick={onRetry}>Try again</button> : undefined}>{message}</PageState>; }
export function PermissionDeniedState() { return <PageState title="Access denied">You do not have permission to view this area.</PageState>; }
