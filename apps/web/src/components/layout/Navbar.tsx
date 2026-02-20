'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { authApi, ApiError } from '@/lib/api'

interface NavbarProps {
  userName?: string
}

export function Navbar({ userName }: NavbarProps) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await authApi.logout()
    } catch (e) {
      if (!(e instanceof ApiError)) console.error(e)
    } finally {
      router.push('/login')
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
      <div className="flex h-16 items-center justify-between px-6">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linkedin">
            <span className="text-white font-bold text-sm">in</span>
          </div>
          <span className="font-semibold text-gray-900">Content AI</span>
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link href="/dashboard" className="text-gray-600 hover:text-linkedin transition-colors">
            Dashboard
          </Link>
          <Link href="/dashboard/suggestions" className="text-gray-600 hover:text-linkedin transition-colors">
            History
          </Link>
          <Link href="/dashboard/profile" className="text-gray-600 hover:text-linkedin transition-colors">
            My Profile
          </Link>
          <Link href="/onboarding" className="text-gray-600 hover:text-linkedin transition-colors">
            Profile Setup
          </Link>
        </nav>

        {/* User area */}
        <div className="flex items-center gap-3">
          {userName && (
            <span className="hidden md:block text-sm text-gray-500">{userName}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            loading={loggingOut}
          >
            Logout
          </Button>
        </div>
      </div>
    </header>
  )
}
