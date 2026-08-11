'use client';

import { documentsApi } from '@/api/documents';
import type { Task } from '@/types/task';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface AttachmentUploadSummary {
  uploaded: number;
  skipped: number;
}

export async function uploadTaskAttachments(form: HTMLFormElement, task: Task, currentUserId: string): Promise<AttachmentUploadSummary> {
  const picker = form.elements.namedItem('attachments') as HTMLInputElement | null;
  const files = Array.from(picker?.files ?? []);
  const actors = Array.from(new Set([currentUserId, task.creator_id, task.assignee_id].filter((value): value is string => Boolean(value))));
  const grants = actors.map(actor_id => ({ actor_id, permissions: ['PREVIEW', 'DOWNLOAD'], expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }));
  const results = await Promise.allSettled(files.filter(file => file.size <= MAX_UPLOAD_BYTES).map(file => {
    const data = new FormData();
    data.set('file', file);
    data.set('title', file.name.replace(/\.[^.]+$/, '') || file.name);
    data.set('document_type', file.name.split('.').pop()?.toUpperCase() || file.type || 'FILE');
    data.set('security_level', 'INTERNAL');
    data.set('declared_state_secret', 'false');
    data.set('task_id', task.id);
    data.set('grants', JSON.stringify(grants));
    return documentsApi.upload(data, () => undefined);
  }));
  return { uploaded: results.filter(result => result.status === 'fulfilled').length, skipped: files.length - results.filter(result => result.status === 'fulfilled').length };
}
