import { DocumentDetail } from '@/features/documents/document-detail';
export default async function DocumentPage({params,searchParams}:{params:Promise<{id:string}>,searchParams:Promise<{task_id?:string}>}){const {id}=await params;const {task_id:taskId}=await searchParams;return <DocumentDetail id={id} taskId={taskId}/>}
