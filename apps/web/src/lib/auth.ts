// Auth helpers — token is stored in httpOnly cookie set by the backend
// Frontend does NOT directly access the raw JWT

export function getTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)token=([^;]*)/)
  return match ? decodeURIComponent(match[1] ?? '') : null
}

export function isLoggedIn(): boolean {
  return Boolean(getTokenFromCookie())
}
