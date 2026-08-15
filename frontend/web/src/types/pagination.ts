export interface PaginationMeta {
  page: number;
  page_size: number;
  total?: number;
  total_pages?: number;
  has_next: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}
