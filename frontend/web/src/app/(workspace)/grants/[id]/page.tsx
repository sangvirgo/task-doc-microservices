import { GrantDetail } from '@/features/grants/grant-detail';
export default async function GrantPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <GrantDetail id={id} />; }
