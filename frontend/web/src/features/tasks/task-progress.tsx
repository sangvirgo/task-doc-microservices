import type { CompletionColor, TaskStatus } from '@/types/task';
import {
  buildTaskProgressModel,
  type TaskProgressInput,
  workflowSteps,
} from './task-progress-model';
import styles from './task-progress.module.css';

export interface TaskProgressProps extends TaskProgressInput {
  compact?: boolean;
}

const colorClass: Record<CompletionColor, string> = {
  GREEN: styles.green,
  YELLOW: styles.yellow,
  RED: styles.red,
};

const terminalLabel: Record<'REJECTED' | 'CANCELLED', string> = {
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
};

function ProgressBar({ percentage, color, label }: { percentage: number; color: CompletionColor; label: string }) {
  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
    >
      <span className={`${styles.fill} ${colorClass[color]}`} style={{ width: `${percentage}%` }} />
    </div>
  );
}

function ParentProgress({ model, compact }: { model: ReturnType<typeof buildTaskProgressModel>; compact: boolean }) {
  const label = 'Tiến độ sub-task';
  const ratio = `${model.approvedCount}/${model.childCount}`;

  if (compact) {
    return (
      <section className={`${styles.card} ${styles.compact}`} aria-label={label}>
        <div className={styles.compactContent}>
          <span className={styles.compactLabel}>{label}</span>
          <span className={styles.compactCount}>{ratio}</span>
        </div>
        <ProgressBar percentage={model.percentage} color={model.color} label={label} />
      </section>
    );
  }

  return (
    <section className={styles.card} aria-label={label}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Theo sub-task</p>
          <h2>{label}</h2>
        </div>
        <strong className={styles.value}>{model.percentage}%</strong>
      </div>
      <ProgressBar percentage={model.percentage} color={model.color} label={label} />
      <p className={styles.supporting}>{ratio} sub-task đã phê duyệt</p>
    </section>
  );
}

function LeafProgress({ status }: { status: TaskStatus }) {
  if (status === 'REJECTED' || status === 'CANCELLED') {
    return (
      <section className={`${styles.card} ${styles.terminal} ${styles.red}`} aria-label={terminalLabel[status]}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Tiến độ công việc</p>
            <h2>{terminalLabel[status]}</h2>
          </div>
          <span className={styles.terminalMark} aria-hidden="true">×</span>
        </div>
        <p className={styles.supporting}>Công việc đã kết thúc ở trạng thái này.</p>
      </section>
    );
  }

  const stepIndex = workflowSteps.findIndex(step => step.status === (status === 'NEED_REVISION' ? 'IN_PROGRESS' : status));

  return (
    <section className={styles.card} aria-label="Tiến độ công việc">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Theo dõi tiến độ</p>
          <h2>Tiến độ công việc</h2>
        </div>
      </div>
      <ol className={styles.stepList} aria-label="Các bước xử lý công việc">
        {workflowSteps.map((step, index) => {
          const current = index === stepIndex;
          const complete = index <= stepIndex;
          return (
            <li
              className={`${styles.step} ${complete ? styles.complete : ''} ${current ? styles.active : ''}`}
              aria-current={current ? 'step' : undefined}
              key={step.status}
            >
              <span className={styles.stepDot} aria-hidden="true">{complete ? '✓' : index + 1}</span>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>
      {status === 'NEED_REVISION' && <p className={`${styles.supporting} ${styles.revision}`}><strong>Cần chỉnh sửa</strong><span>Tiếp tục từ bước Đang làm</span></p>}
    </section>
  );
}

export function TaskProgress({ compact = false, ...input }: TaskProgressProps) {
  const model = buildTaskProgressModel(input);

  if (compact && !model.hasChildren) return null;
  return model.hasChildren ? <ParentProgress model={model} compact={compact} /> : <LeafProgress status={input.status} />;
}
