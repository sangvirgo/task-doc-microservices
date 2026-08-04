import { AuthGate } from '@/auth/auth-gate';
export default function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <AuthGate>{children}</AuthGate>; }
