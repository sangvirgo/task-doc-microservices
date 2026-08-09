'use client';

import type { ChangeEvent } from 'react';
import type { MemberOption } from '@/types/admin';
import { SearchableSelect } from '@/components/searchable-select';
import styles from './tasks.module.css';

export interface SubtaskDraft {
  key: number;
  title: string;
  assignee_id: string;
  deadline: string;
  files: File[];
  security_level: string;
  expires_at: string;
  permissions: string[];
  children: SubtaskDraft[];
}

export const createBlankSubtask = (key: number): SubtaskDraft => ({
  key, title: '', assignee_id: '', deadline: '', files: [], security_level: 'INTERNAL',
  expires_at: '', permissions: ['PREVIEW', 'DOWNLOAD'], children: [],
});

const updateTree = (items: SubtaskDraft[], key: number, update: (item: SubtaskDraft) => SubtaskDraft): SubtaskDraft[] =>
  items.map(item => item.key === key ? update(item) : { ...item, children: updateTree(item.children, key, update) });

function Editor({ draft, index, depth, members, onChange, onRemove, onAddChild }: {
  draft: SubtaskDraft; index: number; depth: number; members: MemberOption[];
  onChange: (update: (item: SubtaskDraft) => SubtaskDraft) => void;
  onRemove: () => void; onAddChild: () => void;
}) {
  const patch = (value: Partial<SubtaskDraft>) => onChange(item => ({ ...item, ...value }));
  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    patch({ files: [...draft.files, ...Array.from(event.currentTarget.files ?? [])] });
    event.currentTarget.value = '';
  };

  return <article className={styles.subtaskDraft} style={{ marginLeft: Math.min(depth, 3) * 14 }}>
    <div className={styles.subtaskNumber}>{index + 1}</div>
    <div className={styles.subtaskFields}>
      <label>Tiêu đề {depth === 0 ? 'sub-task' : depth === 1 ? 'task cháu' : 'task cấp dưới'}<input required value={draft.title} placeholder="Ví dụ: Kiểm tra phụ lục" onChange={event => patch({ title: event.target.value })} /></label>
      <div className={styles.formGrid}>
        <label>Người được giao<SearchableSelect value={draft.assignee_id} onChange={event => patch({ assignee_id: event.target.value })}><option value="">Unassigned</option>{members.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</SearchableSelect></label>
        <label>Hạn hoàn thành<input type="datetime-local" value={draft.deadline} onChange={event => patch({ deadline: event.target.value })} /></label>
      </div>
      <div className={styles.subtaskDocumentBox}>
        <div className={styles.sectionTitle}><div><strong>Tài liệu của task này</strong><span>Gắn riêng, không dùng tài liệu task cha</span></div><span>{draft.files.length} tệp</span></div>
        <label className={styles.subtaskFilePicker}><input type="file" multiple onChange={addFiles} /><strong>Upload tài liệu cho task này</strong><small>PDF, Word, Excel, ảnh hoặc văn bản</small></label>
        {draft.files.length > 0 && <ul className={styles.selectedFiles}>{draft.files.map((file, fileIndex) => <li key={file.name + file.lastModified + fileIndex}><span className={styles.fileIcon}>▧</span><span><strong>{file.name}</strong><small>{Math.ceil(file.size / 1024)} KB</small></span><button type="button" aria-label={'Xóa ' + file.name} onClick={() => patch({ files: draft.files.filter((_, indexToRemove) => indexToRemove !== fileIndex) })}>×</button></li>)}</ul>}
        <div className={styles.formGrid}><label>Mức bảo mật<SearchableSelect value={draft.security_level} onChange={event => patch({ security_level: event.target.value })}><option>PUBLIC</option><option>INTERNAL</option><option>CONFIDENTIAL</option><option>RESTRICTED</option></SearchableSelect></label><label>Hết hạn quyền<input type="datetime-local" required={draft.files.length > 0} value={draft.expires_at} onChange={event => patch({ expires_at: event.target.value })} /></label></div>
        <fieldset className={styles.subtaskPermissions}><legend>Quyền truy cập</legend>{['PREVIEW', 'DOWNLOAD', 'SHARE'].map(permission => <label key={permission}><input type="checkbox" checked={draft.permissions.includes(permission)} onChange={event => patch({ permissions: event.target.checked ? [...draft.permissions, permission] : draft.permissions.filter(value => value !== permission) })} /> {permission}</label>)}</fieldset>
      </div>
      <button className={styles.addChildButton} type="button" onClick={onAddChild}>＋ Thêm task {depth === 0 ? 'cháu' : 'cấp dưới'}</button>
      {draft.children.map((child, childIndex) => <Editor key={child.key} draft={child} index={childIndex} depth={depth + 1} members={members} onChange={update => onChange(item => ({ ...item, children: updateTree(item.children, child.key, update) }))} onRemove={() => onChange(item => ({ ...item, children: item.children.filter(childItem => childItem.key !== child.key) }))} onAddChild={() => onChange(item => ({ ...item, children: updateTree(item.children, child.key, childItem => ({ ...childItem, children: [...childItem.children, createBlankSubtask(Date.now() + Math.random())] })) }))} />)}
    </div>
    <button className={styles.removeSubtaskButton} type="button" aria-label={'Xóa sub-task ' + (index + 1)} onClick={onRemove}>×</button>
  </article>;
}

export function RecursiveSubtaskEditor({ value, onChange, members }: { value: SubtaskDraft[]; onChange: (value: SubtaskDraft[]) => void; members: MemberOption[] }) {
  return <div className={styles.subtaskDrafts}>{value.map((draft, index) => <Editor key={draft.key} draft={draft} index={index} depth={0} members={members} onChange={update => onChange(updateTree(value, draft.key, update))} onRemove={() => onChange(value.filter(item => item.key !== draft.key))} onAddChild={() => onChange(updateTree(value, draft.key, item => ({ ...item, children: [...item.children, createBlankSubtask(Date.now() + Math.random())] })))} />)}</div>;
}
