/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' produces a minimal self-contained bundle in .next/standalone/
  // Required for Docker — avoids copying full node_modules into the image
  output: 'standalone',
  transpilePackages: ['@repo/shared-types'],
}

export default nextConfig
