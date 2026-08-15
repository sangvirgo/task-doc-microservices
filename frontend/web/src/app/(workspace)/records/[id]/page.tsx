import { RecordDetail } from '@/features/records/record-detail'; export default async function RecordPage({params}:{params:Promise<{id:string}>}){return <RecordDetail id={(await params).id}/>;}
