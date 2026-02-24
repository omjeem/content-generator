/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' produces a minimal self-contained bundle in .next/standalone/
  // Required for Docker — avoids copying full node_modules into the image
  output: 'standalone',
  transpilePackages: ['@repo/shared-types'],

  // ── API Proxy Rewrites ──────────────────────────────────────────────────────
  // Proxies /api/* from the Next.js frontend domain → the Express backend.
  //
  // WHY THIS IS REQUIRED IN PRODUCTION:
  //   Without rewrites, the browser makes cross-origin requests:
  //     Frontend:  https://yourapp.com
  //     API:       https://api.yourapp.com   ← different domain
  //
  //   The backend sets an httpOnly cookie (token) on api.yourapp.com.
  //   Next.js middleware runs on yourapp.com and CANNOT read cookies from
  //   api.yourapp.com — different domain entirely. So after login, the
  //   middleware sees no cookie and immediately redirects back to /login,
  //   creating an invisible redirect loop.
  //
  // WITH REWRITES:
  //   Browser → yourapp.com/api/auth/login
  //   Next.js → proxies to API_URL/api/auth/login (server-side)
  //   Cookie is set on yourapp.com (same domain as the frontend)
  //   Middleware CAN read the cookie → redirect to /dashboard works ✓
  //
  // Local dev: NEXT_PUBLIC_API_URL=http://localhost:5006
  // Production: set NEXT_PUBLIC_API_URL to your backend URL in your host's env vars
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5006'
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
