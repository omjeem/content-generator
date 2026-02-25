/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' produces a minimal self-contained bundle in .next/standalone/
  // Required for Docker — avoids copying full node_modules into the image
  output: 'standalone',
  transpilePackages: ['@repo/shared-types'],

  // ── Proxy timeout ───────────────────────────────────────────────────────────
  // AI endpoints (generate, persona/analyze, onboarding/chat) can take 30–90 s.
  // Next.js uses Node's http.request internally for rewrites. We extend the
  // response timeout so the proxy doesn't drop long-running AI connections.
  // This sets the socket timeout on the outgoing proxy leg (Next.js → Express).
  // Value must exceed the Express requestTimeout middleware value (180 s).
  experimental: {
    // proxyTimeout is available in Next.js 14+ for rewrite proxy connections
    proxyTimeout: 240_000, // 4 min — safely above the 180 s Express timeout
  },

  // ── API Proxy Rewrites ──────────────────────────────────────────────────────
  // ALL /api/* requests are proxied server-side from the frontend domain to
  // the Express backend. This is required so:
  //   1. The httpOnly `token` cookie is set on the frontend domain (not the
  //      API domain), making it readable by Next.js middleware for auth checks.
  //   2. All browser requests are same-origin — cookies are always sent.
  //
  // NEVER call the Express API directly from the browser (cross-origin).
  // Doing so means the cookie (set on the frontend domain) is never sent to
  // the API domain → 401 on every request, regardless of sameSite setting.
  //
  // Local dev: NEXT_PUBLIC_API_URL=http://localhost:5006
  // Production: set NEXT_PUBLIC_API_URL to your internal backend URL
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
