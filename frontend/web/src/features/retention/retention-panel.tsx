'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from 'react';
import { readSession } from '@/auth/session';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import { retentionApi } from '@/api/retention';
import type { DisposalApproval, RetentionHold } from '@/types/retention';
import styles from '@/features/records/records.module.css';

export function RetentionPanel() {
  const session = readSession();
  const [holds, setHolds] = useState<RetentionHold[] | null>(null);
  const [approvals, setApprovals] = useState<DisposalApproval[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState('');
  const load = () => {
    setFailed(false); setHolds(null); setApprovals(null);
    Promise.all([retentionApi.holds(), retentionApi.approvals()])
      .then(([holdItems, approvalItems]) => { setHolds(holdItems); setApprovals(approvalItems); })
      .catch(() => setFailed(true));
  };
  useEffect(load, []);
  if (session?.role === 'ADMIN') return <PermissionDeniedState />;
  if (failed) return <ErrorState message="Retention data could not be loaded." onRetry={load} />;
  if (!holds || !approvals) return <LoadingState />;
  const run = async (work: () => Promise<unknown>, success: string) => {
    try { await work(); setStatus(success); load(); } catch { setStatus('The server did not accept that change.'); }
  };
  const placeHold = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    void run(() => retentionApi.placeHold(String(values.get('document_id')), String(values.get('reason'))), 'Retention hold recorded from the server response.');
  };
  const approve = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    void run(() => retentionApi.approve(String(values.get('document_id')), String(values.get('reason'))), 'Disposal approval recorded from the server response.');
  };
  const execute = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const documentId = String(new FormData(event.currentTarget).get('document_id'));
    if (window.confirm('Execute disposal for this document? This action is irreversible.')) {
      void run(() => retentionApi.execute(documentId), 'Disposal execution completed from the server response.');
    }
  };
  return <section><h1>Lưu giữ & hủy</h1><p className={styles.notice}>EMPLOYEE workspace only. Eligibility, approval and disposal are decided by the service; approval and execution require its DISPOSAL_APPROVE capability check.</p>
    <div className={styles.grid}><form className={styles.form} onSubmit={placeHold}><h2>Place retention hold</h2><label>Document ID<input name="document_id" required /></label><label>Lý do<input name="reason" required /></label><button>Place hold</button></form>
    <form className={styles.form} onSubmit={approve}><h2>Approve disposal</h2><label>Document ID<input name="document_id" required /></label><label>Lý do<input name="reason" required /></label><button>Approve disposal</button></form>
    <form className={styles.form} onSubmit={execute}><h2>Execute disposal</h2><label>Document ID<input name="document_id" required /></label><button>Execute disposal</button></form>
    <section className={styles.panel}><h2>Eligibility</h2><p>Run the server-side retention eligibility check. It does not disclose document content.</p><button onClick={() => void run(retentionApi.checkEligibility, 'Eligibility check completed from the server response.')}>Kiểm tra điều kiện</button></section></div>
    {status && <p role="status">{status}</p>}<h2>Retention holds</h2>{holds.length === 0 ? <EmptyState title="No holds found">No retention holds were returned for this account.</EmptyState> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Document</th><th>Lý do</th><th>Placed</th><th>State</th></tr></thead><tbody>{holds.map((hold) => <tr key={hold.id}><td>{hold.document_id}</td><td>{hold.reason}</td><td>{new Date(hold.placed_at).toLocaleString()}</td><td>{hold.released_at ? `Released ${new Date(hold.released_at).toLocaleString()}` : <button onClick={() => { if (window.confirm('Release this retention hold?')) void run(() => retentionApi.releaseHold(hold.id), 'Retention hold released from the server response.'); }}>Release hold</button>}</td></tr>)}</tbody></table></div>}
    <h2>Disposal approvals</h2>{approvals.length === 0 ? <EmptyState title="No approvals found">No disposal approvals were returned for this account.</EmptyState> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Document</th><th>Lý do</th><th>Approved</th></tr></thead><tbody>{approvals.map((approval) => <tr key={approval.id}><td>{approval.document_id}</td><td>{approval.reason}</td><td>{new Date(approval.approved_at).toLocaleString()}</td></tr>)}</tbody></table></div>}</section>;
}
