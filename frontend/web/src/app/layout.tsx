import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'C17 Workspace', description: 'Secure task and document workspace' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to main content</a>{children}</body></html>; }
