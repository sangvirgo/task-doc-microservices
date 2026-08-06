'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useState } from 'react';
import { adminApi } from '@/api/admin';
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from '@/components/common-states';
import { readSession } from '@/auth/session';
import type { ManagedUser } from '@/types/admin';
import { CAPABILITIES, type Capability } from '@/types/capability';
import styles from './admin.module.css';

export function UsersPanel() {
  const session = readSession();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState('');
  const load = () => {
    setUsers(null);
    setFailed(false);
    adminApi.users().then(setUsers).catch(() => setFailed(true));
  };
  useEffect(load, []);

  if (session?.role !== 'ADMIN') return <PermissionDeniedState />;
  if (failed) return <ErrorState message="Users could not be loaded." onRetry={load} />;
  if (!users) return <LoadingState />;

  const change = async (action: () => Promise<unknown>, message: string) => {
    setStatus('Sending request…');
    try {
      await action();
      setStatus(message);
      load();
    } catch {
      setStatus('The server did not accept that change.');
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await change(
      () => adminApi.createUser({ id: String(form.get('id')), email: String(form.get('email')), role: String(form.get('role')) as ManagedUser['role'] }),
      'User created from the server response.',
    );
  };

  const grant = (event: FormEvent<HTMLFormElement>, userId: string) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('capability'));
    if (!CAPABILITIES.includes(value as Capability)) return;
    void change(() => adminApi.grantCapability(userId, value as Capability), 'Capability granted from the server response.');
  };

  return <section>
    <h1>Users &amp; capabilities</h1>
    <p className={styles.notice}>ADMIN-only presentation guard. The API must enforce the ADMIN role and validate capabilities at the server boundary.</p>
    <div className={styles.grid}>
      <section className={styles.panel}>
        <h2>Create user</h2>
        <form className={styles.form} onSubmit={create}>
          <label>User ID (UUID)<input name="id" required /></label>
          <label>Email<input name="email" type="email" required /></label>
          <label>Role<select name="role"><option>EMPLOYEE</option><option>ADMIN</option></select></label>
          <button>Create user</button>
        </form>
      </section>
      <section className={styles.panel}>
        <h2>Capability change</h2>
        <p className={styles.muted}>Only EMPLOYEE accounts can receive one of the three system capabilities.</p>
      </section>
    </div>
    {status && <p role="status">{status}</p>}
    {users.length === 0 ? <EmptyState title="No users returned">No user records are available.</EmptyState> : <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>Email</th><th>Role</th><th>Account</th><th>Capabilities</th><th>Actions</th></tr></thead>
        <tbody>{users.map(user => <tr key={user.id}>
          <td>{user.email}</td>
          <td>{user.role}</td>
          <td>{user.locked_at ? 'Locked' : 'Active'}</td>
          <td>
            <div className={styles.chips}>{user.capabilities.map(cap => <span className={styles.chip} key={cap}>{cap} <button aria-label={`Revoke ${cap}`} onClick={() => change(() => adminApi.revokeCapability(user.id, cap), 'Capability revoked from the server response.')}>×</button></span>)}</div>
            {user.role !== 'ADMIN' && <form className={styles.actions} onSubmit={event => grant(event, user.id)}>
              <select name="capability" aria-label={`Capability for ${user.email}`} defaultValue="" required>
                <option value="" disabled>Select capability</option>
                {CAPABILITIES.map(cap => <option key={cap} value={cap}>{cap}</option>)}
              </select>
              <button>Add</button>
            </form>}
          </td>
          <td><button onClick={() => change(() => user.locked_at ? adminApi.unlock(user.id) : adminApi.lock(user.id), user.locked_at ? 'User unlocked from the server response.' : 'User locked from the server response.')}>{user.locked_at ? 'Unlock' : 'Lock'}</button></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}