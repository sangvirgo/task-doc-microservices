import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getList: vi.fn() }));

vi.mock('@/api/client', () => ({ gatewayClient: { getList: mocks.getList } }));

import { grantsApi } from '@/api/grants';

describe('grantsApi list filters', () => {
  beforeEach(() => mocks.getList.mockReset().mockResolvedValue([]));

  it('lists grants issued by the current user', async () => {
    await grantsApi.list({ grantor_id: 'grantor-id' });

    expect(mocks.getList).toHaveBeenCalledWith('/permissions/grants?grantor_id=grantor-id');
  });
});
