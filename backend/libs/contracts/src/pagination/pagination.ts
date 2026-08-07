import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

export function createPaginationMeta(
  page: number,
  page_size: number,
  total: number,
): PaginationMeta {
  const total_pages = total === 0 ? 0 : Math.ceil(total / page_size);

  return {
    page,
    page_size,
    total,
    total_pages,
    has_next: total_pages > 0 && page < total_pages,
    has_previous: page > 1 && total_pages > 0,
  };
}

export function toPrismaPagination(pagination: PaginationQuery): { skip: number; take: number } {
  return {
    skip: (pagination.page - 1) * pagination.page_size,
    take: pagination.page_size,
  };
}
