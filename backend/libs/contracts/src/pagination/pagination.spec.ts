import {
  createPaginationMeta,
  paginationQuerySchema,
  toPrismaPagination,
} from './pagination';

describe('pagination contract', () => {
  it('defaults page and page_size', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, page_size: 20 });
  });

  it('accepts page_size up to 100 and rejects larger or non-positive values', () => {
    expect(paginationQuerySchema.parse({ page: '2', page_size: '100' })).toEqual({
      page: 2,
      page_size: 100,
    });
    expect(() => paginationQuerySchema.parse({ page_size: '101' })).toThrow();
    expect(() => paginationQuerySchema.parse({ page: '0' })).toThrow();
  });

  it('calculates metadata for first, middle, empty, and beyond-last pages', () => {
    expect(createPaginationMeta(1, 20, 45)).toEqual({
      page: 1,
      page_size: 20,
      total: 45,
      total_pages: 3,
      has_next: true,
      has_previous: false,
    });
    expect(createPaginationMeta(2, 20, 45).has_previous).toBe(true);
    expect(createPaginationMeta(1, 20, 0).total_pages).toBe(0);
    expect(createPaginationMeta(4, 20, 45).has_next).toBe(false);
  });

  it('calculates the Prisma offset', () => {
    expect(toPrismaPagination({ page: 3, page_size: 25 })).toEqual({ skip: 50, take: 25 });
  });
});
