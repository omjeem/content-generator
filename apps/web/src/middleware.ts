import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Protected routes that require authentication
const protectedRoutes = ["/dashboard", "/onboarding"];
const authRoutes = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const { pathname } = request.nextUrl;

  // Redirect unauthenticated users away from protected routes
  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );
  if (isProtected && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirect authenticated users away from auth pages and the landing page
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));
  if ((isAuthRoute || pathname === "/") && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
