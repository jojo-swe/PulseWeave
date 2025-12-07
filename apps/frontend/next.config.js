/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@pulseweave/types'],
  
  // For production deployment modes:
  // 'standalone' - Best for Docker/containerized deployments
  // 'export' - Static export only (removes API routes, SSR)
  // undefined - Standard Node.js server mode
  output: process.env.NEXT_OUTPUT_MODE || 'standalone',
  
  images: {
    // Disable image optimization for static export compatibility
    // In production with 'standalone' mode, you can enable this
    unoptimized: process.env.NEXT_OUTPUT_MODE === 'export',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  
  // Trailing slashes for consistent URLs
  trailingSlash: true,
  
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
  
  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || '1.0.0',
  },
};

module.exports = nextConfig;
