import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Task } from '@/types/task';
import { tasksApi } from '@/api/tasks';
import styles from './task-children.module.css';
import { taskStatusClass, taskStatusLabel } from './task-status';

const formatDeadline = (deadline: string | null, overdue: boolean) => {
  if (!deadline) return 'Chưa đặt hạn';
  const formatted = new Date(deadline).toLocaleDateString('vi-VN', { day: '2-digit', month: 'short' });
  return overdue ? `${formatted} · Quá hạn` : formatted;
};

export function TaskChildren({ parentId }: { parentId: string }) {
  const [children, setChildren] = useState<Task[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadChildren() {
      setChildren(null);
      setError(false);
      try {
        const nextChildren = await tasksApi.children(parentId);
        if (!cancelled) setChildren(nextChildren);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void loadChildren();
    return () => {
      cancelled = true;
    };
  }, [parentId, attempt]);

  if (children === null && !error) {
    return <section className={styles.section}>Đang tải sub-task…</section>;
  }

  if (error) {
    return (
      <section className={styles.section} role="alert">
        <div className={styles.error}>
          <strong>Không tải được sub-task.</strong>
          <span>Kiểm tra quyền truy cập hoặc trạng thái API rồi thử lại.</span>
          <button type="button" onClick={() => setAttempt(value => value + 1)}>Thử lại</button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-labelledby={`task-children-${parentId}`}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Bên trong task này</p>
          <h2 id={`task-children-${parentId}`}>Sub-task</h2>
        </div>
        <span className={styles.count}>{children?.length ?? 0}</span>
      </div>

      {children?.length ? (
        <div className={styles.list}>
          {children.map(child => (
            <Link className={styles.item} href={`/tasks/${child.id}`} key={child.id}>
              <span className={styles.check} aria-hidden="true">{child.status === 'APPROVED' ? '✓' : '○'}</span>
              <span className={styles.content}>
                <strong>{child.title}</strong>
                <small>{formatDeadline(child.deadline, child.is_overdue)}</small>
              </span>
              <span className={`${styles.badge} ${styles[taskStatusClass(child.status)]}`}>{taskStatusLabel(child.status)}</span>
              <span className={styles.arrow} aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>Chưa có sub-task trong công việc này.</p>
      )}
    </section>
  );
}
