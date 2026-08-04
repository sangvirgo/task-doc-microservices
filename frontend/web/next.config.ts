import type { NextConfig } from 'next';

const gatewayBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  output: 'standalone',
  async rewrites() {
    return [{ source: '/gateway/:path*', destination: `${gatewayBaseUrl}/api/:path*` }];
  },
};

export default nextConfig;
