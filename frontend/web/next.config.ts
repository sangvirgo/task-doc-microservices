import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const gatewayBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://13.229.104.126:3000';

export default function nextConfig(phase: string): NextConfig {
  return {
    // Keep Turbopack development chunks isolated from production build output.
    // Otherwise `next build` while dev is open can invalidate every client route.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
    allowedDevOrigins: ['127.0.0.1'],
    output: 'standalone',
    async rewrites() {
      return [{ source: '/gateway/:path*', destination: `${gatewayBaseUrl}/api/:path*` }];
    },
  };
}
