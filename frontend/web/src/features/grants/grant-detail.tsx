'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { grantsApi } from '@/api/grants';
import { readSession } from '@/auth/session';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import type { Grant } from '@/types/grant';
import styles from './grants.module.css';

const when = (value: string | null) => value ? new Date(value).toLocaleString() : 'Chưa thu hồi';
export function GrantDetail({ id }: { id: string }) {
  const session = readSession(); const [grant, setGrant] = useState<Grant | null>(null); const [error, setError] = useState(false); const [message, setMessage] = useState('');
  const load = () => { setGrant(null); setError(false); grantsApi.get(id).then(setGrant).catch(() => setError(true)); }; useEffect(load, [id]);
  if (session?.role === 'ADMIN') return <PermissionDeniedState />;
  if (error) return <ErrorState message="Không thể tải quyền tài liệu." onRetry={load} />; if (!grant) return <LoadingState />;
  const delegate = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const permissions = String(form.get('permissions')).split(',').map(value => value.trim()).filter(Boolean); setMessage('Đang chuyển tiếp quyền…'); try { const result = await grantsApi.delegate(grant.id, String(form.get('actor_id')), permissions.length ? permissions : undefined); setMessage(`Máy chủ đã ghi nhận chuyển tiếp quyền: ${result.status.toLowerCase()}. `); load(); } catch { setMessage('Máy chủ không chấp nhận chuyển tiếp quyền.'); } };
  const revoke = async () => { const reason = window.prompt('Lý do thu hồi (tùy chọn)') ?? undefined; setMessage('Đang thu hồi quyền…'); try { const result = await grantsApi.revoke(grant.id, reason); setGrant(result); setMessage(`Máy chủ đã trả về trạng thái ${result.status.toLowerCase()}. `); } catch { setMessage('Máy chủ không chấp nhận thu hồi quyền.'); } };
  return <section><div className={styles.head}><div><Link href="/grants">← Quyền tài liệu</Link><h1>Chi tiết quyền tài liệu</h1></div></div><p className={styles.notice}>Trạng thái, thời hạn hiệu lực và thời điểm thu hồi được lấy trực tiếp từ máy chủ.</p><dl className={styles.detail}><dt>Tài nguyên</dt><dd>{grant.resource_type}</dd><dt>Quyền</dt><dd>{grant.permissions.join(', ')}</dd><dt>Trạng thái</dt><dd>{grant.status}</dd><dt>Thời hạn yêu cầu</dt><dd>{when(grant.expires_at)}</dd><dt>Thời hạn hiệu lực</dt><dd>{when(grant.effective_expires_at)}</dd><dt>Thu hồi lúc</dt><dd>{when(grant.revoked_at)}</dd><dt>Quyền gốc</dt><dd>{grant.parent_grant_id ?? 'Không có'}</dd></dl><form className={styles.form} onSubmit={delegate}><h2>Chuyển tiếp quyền</h2><label>Mã nhân viên nhận quyền<input name="actor_id" required /></label><label>Quyền (tùy chọn, phân tách bằng dấu phẩy)<input name="permissions" /></label><div className={styles.actions}><button>Chuyển tiếp</button><button type="button" onClick={revoke} disabled={grant.revoked_at !== null || grant.status !== 'ACTIVE'}>Thu hồi quyền</button>{message && <p role="status">{message}</p>}</div></form>{grant.status !== 'ACTIVE' && <EmptyState title="Không có thao tác khả dụng">Máy chủ trả về quyền ở trạng thái {grant.status.toLowerCase()}.</EmptyState>}</section>;
}
