import type { INestApplication } from '@nestjs/common';

import { attachAuthContextFromHeaders } from '@c17/auth-context';

import { configureApp } from '../src/bootstrap-config';

describe('user-role-management-service bootstrap', () => {
  it('registers auth context middleware for gateway headers', () => {
    const use = jest.fn();
    const app = { use } as unknown as INestApplication;

    configureApp(app);

    expect(use).toHaveBeenCalledWith(attachAuthContextFromHeaders);
  });
});
