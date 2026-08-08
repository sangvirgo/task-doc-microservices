'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { grantsApi } from '@/api/grants';
import { documentsApi } from '@/api/documents';
import { tasksApi } from '@/api/tasks';
import { adminApi } from '@/api/admin';
import { readSession } from '@/auth/session';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import type { Grant } from '@/types/grant';
import type { Document } from '@/types/document';
import type { Task } from '@/types/task';
import type { MemberOption } from '@/types/admin';
import styles from './grants.module.css';
import { SearchableSelect } from '@/components/searchable-select';

const formatTime = (value: string | null) => value ? new Date(value).toLocaleString() : 'Chưa thu hồi';

export function GrantList() {
  const session = readSession();
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState('');
  const load = () => { if (!session?.userId) return; setGrants(null); setError(false); grantsApi.list(session.userId).then(setGrants).catch(() => setError(true)); documentsApi.list().then(setDocuments).catch(() => setDocuments([])); tasksApi.list().then(setTasks).catch(() => setTasks([])); adminApi.directory().then(setMembers).catch(() => setMembers([])); };
  useEffect(load, [session?.userId]);
  if (session?.role === 'ADMIN') return <PermissionDeniedState />;
  if (!session?.userId) return <ErrorState message="Không có thông tin phiên đăng nhập. Vui lòng đăng nhập lại." />;
  const userId = session.userId;
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const permissions = String(form.get('permissions')).split(',').map(value => value.trim()).filter(Boolean); setStatus('Đang tạo quyền...'); try { const created = await grantsApi.create({ grantor_id: userId, actor_id: String(form.get('actor_id')), resource_type: 'DOCUMENT', resource_id: String(form.get('resource_id')), task_id: String(form.get('task_id')), permissions, expires_at: new Date(String(form.get('expires_at'))).toISOString() }); setStatus(`Quyền đã được tạo với trạng thái ${created.status}.`); formElement.reset(); load(); } catch { setStatus('Máy chủ không chấp nhận việc cấp quyền.'); } };
  if (error) return <ErrorState message="Không thể tải quyền tài liệu. Máy chủ vẫn là nơi quyết định quyền truy cập." onRetry={load} />;
  if (!grants) return <LoadingState />;
  return <section><div className={styles.head}><div><h1>Quyền tài liệu</h1><p>Chọn tên người nhận, tài liệu và công việc thay vì phải nhớ ID.</p></div></div><form className={styles.form} onSubmit={create}><h2>Cấp quyền tài liệu</h2><label>Người nhận<SearchableSelect name="actor_id" required defaultValue=""><option value="" disabled>Chọn nhân viên</option>{members.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</SearchableSelect></label><label>Tài liệu<SearchableSelect name="resource_id" required defaultValue=""><option value="" disabled>Chọn tài liệu</option>{documents.map(document => <option key={document.id} value={document.id}>{document.title}</option>)}</SearchableSelect></label><label>Công việc<SearchableSelect name="task_id" required defaultValue=""><option value="" disabled>Chọn công việc</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</SearchableSelect></label><label>Quyền (phân tách bằng dấu phẩy)<input name="permissions" required placeholder="PREVIEW, DOWNLOAD" /></label><label>Thời hạn<input name="expires_at" type="datetime-local" required /></label><div className={styles.actions}><button>Cấp quyền</button>{status && <p role="status">{status}</p>}</div></form>{grants.length === 0 ? <EmptyState title="Chưa có quyền tài liệu">Các quyền gắn với phiên này sẽ xuất hiện ở đây.</EmptyState> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Tài nguyên</th><th>Trạng thái</th><th>Hết hạn</th><th>Đã thu hồi</th></tr></thead><tbody>{grants.map(grant => <tr key={grant.id}><td><Link href={`/grants/${grant.id}`}>{grant.resource_type}</Link></td><td>{grant.status}</td><td>{formatTime(grant.effective_expires_at)}</td><td>{formatTime(grant.revoked_at)}</td></tr>)}</tbody></table></div>}</section>;
}
