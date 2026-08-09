import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Task } from '@/types/task'; import type { TaskDocument } from '@/types/document';
import { tasksApi } from '../../api/tasks';
import { documentsApi } from '../../api/documents';
import styles from './task-children.module.css';

type TaskBranch = {
  task: Task;
  documents: TaskDocument[];
  documentError: boolean;
  children: TaskBranch[];
};

async function getTaskDocuments(taskId: string) {
  if (!documentsApi.taskDocuments) {
    return { documents: [] as TaskDocument[], documentError: true };
  }

  try {
    return {
      documents: await documentsApi.taskDocuments(taskId),
      documentError: false,
    };
  } catch {
    return { documents: [] as TaskDocument[], documentError: true };
  }
}

async function loadBranch(task: Task): Promise<TaskBranch> {
  const [documentResult, children] = await Promise.all([
    getTaskDocuments(task.id),
    tasksApi.children?.(task.id) ?? Promise.resolve([] as Task[]),
  ]);

  return {
    task,
    documents: documentResult.documents,
    documentError: documentResult.documentError,
    children: await Promise.all(children.map(loadBranch)),
  };
}

function countDescendantTasks(branches: TaskBranch[]): number {
  return branches.reduce(
    (total, branch) => total + 1 + countDescendantTasks(branch.children),
    0,
  );
}

function countDescendantDocuments(branches: TaskBranch[]): number {
  return branches.reduce(
    (total, branch) =>
      total + branch.documents.length + countDescendantDocuments(branch.children),
    0,
  );
}

function TaskBranchView({ branch, level }: { branch: TaskBranch; level: number }) {
  const task = branch.task;
  const documentCount = branch.documents.length;

  return (
    <article className={styles.item} style={{ marginLeft: Math.min(level, 4) * 18 + 'px' }}>
      <div className={styles.marker}>{level}</div>
      <div className={styles.content}>
        <div className={styles.itemHeader}>
          <Link className={styles.taskLink} href={'/tasks/' + task.id}>
            {task.title}
          </Link>
          <span className={styles.badge}>{task.status}</span>
        </div>

        <div className={styles.meta}>
          {documentCount} tài liệu trực tiếp
          {branch.children.length > 0 && ' · ' + branch.children.length + ' task con'}
        </div>

        {branch.documentError && (
          <p className={styles.documentError}>
            Không tải được tài liệu của task này. Mở task để kiểm tra quyền truy cập.
          </p>
        )}

        {branch.documents.length > 0 && (
          <ul className={styles.documentList}>
            {branch.documents.map((document) => (
              <li className={styles.document} key={document.document_id}>
                <span className={styles.documentIcon}>▧</span>
                <Link
                  className={styles.documentLink}
                  href={'/documents/' + document.document_id + '?task_id=' + task.id}
                >
                  {document.title || 'Tài liệu'}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {branch.children.length > 0 && (
          <div className={styles.children}>
            {branch.children.map((child) => (
              <TaskBranchView key={child.task.id} branch={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export function TaskChildren({ parentId }: { parentId: string }) {
  const [branches, setBranches] = useState<TaskBranch[] | null>(null);
  const [parentDocumentCount, setParentDocumentCount] = useState(0);
  const [parentDocumentError, setParentDocumentError] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadTree() {
      setBranches(null);
      setError(false);

      try {
        const [children, parentDocuments] = await Promise.all([
          tasksApi.children?.(parentId) ?? Promise.resolve([] as Task[]),
          getTaskDocuments(parentId),
        ]);
        const nextBranches = await Promise.all(children.map(loadBranch));

        if (!cancelled) {
          setBranches(nextBranches);
          setParentDocumentCount(parentDocuments.documents.length);
          setParentDocumentError(parentDocuments.documentError);
        }
      } catch {
        if (!cancelled) {
          setError(true);
        }
      }
    }

    void loadTree();
    return () => {
      cancelled = true;
    };
  }, [parentId, attempt]);

  if (branches === null && !error) {
    return <section className={styles.section}>Đang tải cây task và tài liệu...</section>;
  }

  if (error) {
    return (
      <section className={styles.section}>
        <div className={styles.error}>
          <strong>Không tải được task con.</strong>
          <span>Kiểm tra quyền truy cập hoặc trạng thái API rồi thử lại.</span>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Thử lại
          </button>
        </div>
      </section>
    );
  }

  if (!branches || branches.length === 0) {
    return null;
  }

  const descendantTaskCount = countDescendantTasks(branches);
  const descendantDocumentCount = countDescendantDocuments(branches);
  const totalDocumentCount = parentDocumentCount + descendantDocumentCount;

  return (
    <section className={styles.section} aria-labelledby={'task-children-' + parentId}>
      <div className={styles.heading}>
        <div>
          <h2 id={'task-children-' + parentId}>Cây công việc &amp; tài liệu</h2>
          <p>Tài liệu được giữ riêng theo từng task, không trộn vào task cha.</p>
        </div>
        <span className={styles.summary}>
          Tổng cây: {totalDocumentCount} tài liệu · {descendantTaskCount} task con
        </span>
      </div>

      {parentDocumentError && (
        <p className={styles.documentError}>
          Chưa thể tính đầy đủ tổng tài liệu vì không tải được tài liệu trực tiếp của task cha.
        </p>
      )}

      <div className={styles.list}>
        {branches.map((branch) => (
          <TaskBranchView key={branch.task.id} branch={branch} level={1} />
        ))}
      </div>
    </section>
  );
}
