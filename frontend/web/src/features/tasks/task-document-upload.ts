'use client';

import { documentsApi } from '@/api/documents';
import { GatewayError } from '@/lib/errors';
import type { Task } from '@/types/task';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface AttachmentUploadSummary {
  uploaded: number;
  skipped: number;
  failed: number;
  error?: string;
}

export async function uploadTaskAttachments(
  form: HTMLFormElement,
  task: Task,
  currentUserId: string,
): Promise<AttachmentUploadSummary> {
  const picker = form.elements.namedItem('attachments') as HTMLInputElement | null;
  const files = Array.from(picker?.files ?? []);
  const validFiles = files.filter((file) => file.size <= MAX_UPLOAD_BYTES);
  const oversized = files.length - validFiles.length;
  const actors = Array.from(
    new Set(
      [currentUserId, task.creator_id, task.assignee_id, task.reviewer_id].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
  const grants = actors.map((actor_id) => ({
    actor_id,
    permissions: ['PREVIEW', 'DOWNLOAD'],
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }));
  const results = await Promise.allSettled(
    validFiles.map((file) => {
      const data = new FormData();
      data.set('file', file);
      data.set('title', file.name.replace(/\.[^.]+$/, '') || file.name);
      data.set('document_type', file.name.split('.').pop()?.toUpperCase() || file.type || 'FILE');
      data.set('security_level', 'INTERNAL');
      data.set('declared_state_secret', 'false');
      data.set('task_id', task.id);
      data.set('grants', JSON.stringify(grants));
      return documentsApi.upload(data, () => undefined);
    }),
  );
  const failedResults = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  const firstError = failedResults[0]?.reason;
  const error =
    firstError instanceof GatewayError
      ? 'Mã lỗi ' + firstError.status
      : firstError
        ? 'Lỗi xử lý bảo mật'
        : oversized > 0
          ? 'Có tệp vượt quá 25 MB'
          : undefined;
  return {
    uploaded: results.length - failedResults.length,
    failed: failedResults.length,
    skipped: oversized + failedResults.length,
    error,
  };
}
