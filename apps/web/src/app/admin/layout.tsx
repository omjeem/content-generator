"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview", icon: "📊", exact: true },
  { href: "/admin/users", label: "Users", icon: "👥", exact: false },
  {
    href: "/admin/token-requests",
    label: "Token Requests",
    icon: "🎟️",
    exact: false,
  },
  { href: "/admin/analytics", label: "Analytics", icon: "📈", exact: false },
  { href: "/admin/profile", label: "Profile", icon: "⚙️", exact: false },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        {/* Brand */}
        <div className="px-5 py-5 border-b border-gray-100">
          <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
            Admin
          </p>
          <Link
            href="/admin"
            className="text-base font-bold text-gray-900 hover:text-indigo-600 transition-colors"
          >
            PostMind
          </Link>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                )}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer — back to app */}
        <div className="px-3 pb-5 border-t border-gray-100 pt-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <span className="text-base">←</span>
            Back to App
          </Link>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 text-white text-xs font-semibold px-3 py-1">
            🛡️ Admin Dashboard
          </span>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
