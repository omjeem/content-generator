import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

const EXTERNAL_TRACK_URL = "https://ommishra.tech/api/track/external";

// Protected routes that require authentication (any logged-in user)
const protectedRoutes = ["/dashboard", "/onboarding"];
// Admin-only routes (require role='admin' in JWT)
const adminOnlyRoutes = ["/admin"];
const authRoutes = ["/login", "/register"];

/**
 * Decode a JWT payload without verifying the signature.
 * Safe to use in middleware — we only need the role claim for routing.
 * The API validates the signature on every protected request, so this is
 * only used to redirect non-admins away from /admin pages.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    if (!payload) return null;
    // atob is available in Edge runtime (Next.js middleware)
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest, event: NextFetchEvent) {
  const token = request.cookies.get("token")?.value;
  const { pathname } = request.nextUrl;

  // ── External source tracking — fire-and-forget ping, then strip from URL ──
  const source = request.nextUrl.searchParams.get("source");
  if (source) {
    const trackingUrl = new URL(EXTERNAL_TRACK_URL);
    trackingUrl.searchParams.set("source", source);
    trackingUrl.searchParams.set("domain", "PostMindAi");
    event.waitUntil(fetch(trackingUrl.toString()).catch(() => {}));

    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete("source");
    return NextResponse.redirect(cleanUrl);
  }

  // ── Admin setup — any authenticated user can access (admin can't log in yet) ──
  // /admin/setup is the one-time setup page accessible before the admin role is set.
  if (pathname === "/admin/setup") {
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  // ── Admin routes — require auth + admin role ──────────────────────────────
  const isAdminRoute = adminOnlyRoutes.some((route) =>
    pathname.startsWith(route),
  );
  if (isAdminRoute) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const payload = decodeJwtPayload(token);
    if (!payload || payload["role"] !== "admin") {
      // Authenticated but not admin — send them to the app
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // ── Regular protected routes — require auth ────────────────────────────────
  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );
  if (isProtected && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ── Redirect authenticated users away from auth pages and the landing page ──
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));
  if ((isAuthRoute || pathname === "/") && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
