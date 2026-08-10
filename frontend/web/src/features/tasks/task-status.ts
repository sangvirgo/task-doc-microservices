const LABELS: Record<string, string> = {
  CREATED: 'Mới tạo',
  ASSIGNED: 'Đã giao',
  IN_PROGRESS: 'Đang làm',
  WAITING_REVIEW: 'Chờ phê duyệt',
  APPROVED: 'Đã phê duyệt',
  NEED_REVISION: 'Cần chỉnh sửa',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
};

export const taskStatusLabel = (value: string) => LABELS[value] ?? value;
export const taskStatusClass = (value: string) => value.toLowerCase().replace('_', '-');
