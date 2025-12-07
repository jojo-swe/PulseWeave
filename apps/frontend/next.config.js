/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@pulseweave/types'],
  output: 'export',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

module.exports = nextConfig;
