"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { authApi, tokenApi, ApiError } from "@/lib/api";
import type { ITokenUsageSummary } from "@repo/shared-types";

interface NavbarProps {
  userName?: string;
}

export function Navbar({ userName }: NavbarProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<ITokenUsageSummary | null>(null);

  // Fetch token usage silently on mount — failure is non-critical
  useEffect(() => {
    tokenApi
      .getUsage()
      .then(setTokenUsage)
      .catch(() => {}); // silently ignore
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await authApi.logout();
    } catch (e) {
      if (!(e instanceof ApiError)) console.error(e);
    } finally {
      router.push("/login");
    }
  }

  // Color based on usage percentage
  function getBarColor(percent: number): string {
    if (percent >= 100) return "bg-red-500";
    if (percent >= 80) return "bg-amber-500";
    return "bg-[#0A66C2]";
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
          <Link
            href="/dashboard"
            className="text-gray-600 hover:text-linkedin transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/suggestions"
            className="text-gray-600 hover:text-linkedin transition-colors"
          >
            History
          </Link>
          <Link
            href="/dashboard/profile"
            className="text-gray-600 hover:text-linkedin transition-colors"
          >
            My Profile
          </Link>
          <Link
            href="/onboarding"
            className="text-gray-600 hover:text-linkedin transition-colors"
          >
            Profile Setup
          </Link>
          <Link
            href="/dashboard/usage"
            className="text-gray-600 hover:text-linkedin transition-colors"
          >
            Token Usage
          </Link>
        </nav>

        {/* User area */}
        <div className="flex items-center gap-4">
          {/* Token usage indicator */}
          {tokenUsage && (
            <Link
              href="/dashboard/usage"
              className="hidden md:flex flex-col items-end gap-0.5 group"
              title={`${tokenUsage.tokensUsed.toLocaleString()} / ${tokenUsage.tokenLimit.toLocaleString()} tokens used`}
            >
              <span className="text-[10px] text-gray-400 group-hover:text-gray-600 transition-colors leading-none">
                Token Usage
              </span>
              {/* Progress bar */}
              <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getBarColor(tokenUsage.percentUsed)}`}
                  style={{ width: `${Math.min(100, tokenUsage.percentUsed)}%` }}
                />
              </div>
              <span
                className={`text-[10px] leading-none ${
                  tokenUsage.percentUsed >= 100
                    ? "text-red-500 font-medium"
                    : tokenUsage.percentUsed >= 80
                      ? "text-amber-500"
                      : "text-gray-400"
                }`}
              >
                {tokenUsage.percentUsed >= 100
                  ? "Quota exceeded"
                  : `${tokenUsage.tokensRemaining.toLocaleString()} left`}
              </span>
            </Link>
          )}

          {userName && (
            <span className="hidden md:block text-sm text-gray-500">
              {userName}
            </span>
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
  );
}
