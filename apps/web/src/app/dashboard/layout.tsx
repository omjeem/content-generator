'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { authApi } from '@/lib/api'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [userName, setUserName] = useState('')

  useEffect(() => {
    authApi.me()
      .then(({ user }) => setUserName(user.name))
      .catch(() => router.push('/login'))
  }, [router])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar userName={userName} />
      <div className="flex-1">{children}</div>
    </div>
  )
}
