import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Next.js Gateway rewrite', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('uses the local Gateway when no backend URL is configured', async () => {
    const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    vi.resetModules();

    try {
      const { default: nextConfig } = await import('../next.config');
      const rewrites = await nextConfig('phase-production-build').rewrites?.();

      expect(rewrites).toEqual([
        {
          source: '/gateway/:path*',
          destination: 'http://localhost:3000/api/:path*',
        },
      ]);
    } finally {
      if (configuredBaseUrl === undefined) {
        delete process.env.NEXT_PUBLIC_API_BASE_URL;
      } else {
        process.env.NEXT_PUBLIC_API_BASE_URL = configuredBaseUrl;
      }
    }
  });

  it('uses the configured backend URL for the Gateway rewrite', async () => {
    const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://backend.test:3000';
    vi.resetModules();

    try {
      const { default: nextConfig } = await import('../next.config');
      const rewrites = await nextConfig('phase-production-build').rewrites?.();

      expect(rewrites).toEqual([
        {
          source: '/gateway/:path*',
          destination: 'http://backend.test:3000/api/:path*',
        },
      ]);
    } finally {
      if (configuredBaseUrl === undefined) {
        delete process.env.NEXT_PUBLIC_API_BASE_URL;
      } else {
        process.env.NEXT_PUBLIC_API_BASE_URL = configuredBaseUrl;
      }
    }
  });
});
