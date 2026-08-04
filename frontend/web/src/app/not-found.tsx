import Link from 'next/link';
import { PageState } from '@/components/common-states';
export default function NotFound() { return <PageState title="Page not found" action={<Link href="/workspace">Return to workspace</Link>}>The page you requested does not exist.</PageState>; }
