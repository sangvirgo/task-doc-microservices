import { DocumentDetail } from '@/features/documents/document-detail';
export default async function DocumentPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <DocumentDetail id={id}/>}
