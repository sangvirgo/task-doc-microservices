import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const gatewayBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export default function nextConfig(phase: string): NextConfig {
  return {
    // Keep Turbopack development chunks isolated from production build output.
    // Otherwise `next build` while dev is open can invalidate every client route.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
    allowedDevOrigins: ['127.0.0.1', '13.229.104.126', 'task.tansang.dpdns.org'],
    output: 'standalone',
    async rewrites() {
      return [{ source: '/gateway/:path*', destination: `${gatewayBaseUrl}/api/:path*` }];
    },
    async headers() {
      return [
        {
          source: '/_next/static/:path*',
          headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
        },
        {
          source: '/_next/image',
          headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=31536000' }],
        },
        {
          source: '/favicon.ico',
          headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
        },
      ];
    },
  };
}
