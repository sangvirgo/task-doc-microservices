import { PackageDetail } from '@/features/records/package-detail'; export default async function PackagePage({params}:{params:Promise<{id:string}>}){return <PackageDetail id={(await params).id}/>;}
