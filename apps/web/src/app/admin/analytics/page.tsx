"use client";

import { useEffect, useState, useCallback } from "react";
import { adminApi, type IAdminAnalyticsOverview } from "@/lib/api";

interface DailyTokenEntry {
  _id: string; // "YYYY-MM-DD"
  totalTokens: number;
  count: number;
}

function StatBlock({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500 font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/** Tiny inline bar chart using flex + div widths. */
function TokenChart({ daily }: { daily: DailyTokenEntry[] }) {
  if (daily.length === 0) {
    return (
      <p className="text-sm text-gray-400">No token usage data for the last 30 days.</p>
    );
  }
  const max = Math.max(...daily.map((d) => d.totalTokens), 1);
  return (
    <div className="space-y-1">
      {daily.map((entry) => {
        const pct = Math.max(2, Math.round((entry.totalTokens / max) * 100));
        return (
          <div key={entry._id} className="flex items-center gap-3 text-xs">
            <span className="w-24 text-gray-400 shrink-0 tabular-nums">
              {entry._id.slice(5)} {/* MM-DD */}
            </span>
            <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-20 text-right text-gray-500 tabular-nums shrink-0">
              {(entry.totalTokens / 1000).toFixed(1)}K
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [overview, setOverview] = useState<IAdminAnalyticsOverview | null>(null);
  const [daily, setDaily] = useState<DailyTokenEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ovRes, dailyRes] = await Promise.all([
        adminApi.getAnalyticsOverview(),
        adminApi.getTokensOverTime(),
      ]);
      setOverview(ovRes);
      setDaily(dailyRes.daily);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm">Loading analytics…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  // Total tokens from last 30 days
  const tokens30d = daily.reduce((sum, d) => sum + d.totalTokens, 0);
  const ops30d = daily.reduce((sum, d) => sum + d.count, 0);
  const avgPerOp = ops30d > 0 ? Math.round(tokens30d / ops30d) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Platform-wide usage metrics
        </p>
      </div>

      {/* ── Key stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatBlock label="Total Users" value={overview?.totalUsers ?? 0} />
        <StatBlock
          label="Active This Week"
          value={overview?.activeThisWeek ?? 0}
          sub={`${overview?.activeThisMonth ?? 0} active this month`}
        />
        <StatBlock
          label="Total Tokens Used"
          value={
            overview?.totalTokensUsed
              ? `${(overview.totalTokensUsed / 1_000).toFixed(1)}K`
              : "0"
          }
          sub="All time, all users"
        />
        <StatBlock
          label="Suggestions Generated"
          value={overview?.totalSuggestions ?? 0}
          sub="Total suggestion sets"
        />
      </div>

      {/* ── Last 30 days sub-stats ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatBlock
          label="Tokens (Last 30 Days)"
          value={`${(tokens30d / 1_000).toFixed(1)}K`}
        />
        <StatBlock label="AI Operations (30 Days)" value={ops30d} />
        <StatBlock
          label="Avg Tokens / Operation"
          value={avgPerOp.toLocaleString()}
        />
      </div>

      {/* ── Token usage over time chart ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          📊 Token Usage — Last 30 Days
        </h2>
        <TokenChart daily={daily} />
      </div>

      {/* ── Pending requests callout ─────────────────────────────────────────── */}
      {(overview?.pendingRequests ?? 0) > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-800">
            🎟️ {overview!.pendingRequests} pending token increase request
            {overview!.pendingRequests !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-amber-600 mt-1">
            Review them on the{" "}
            <a
              href="/admin/token-requests"
              className="underline hover:text-amber-800"
            >
              Token Requests
            </a>{" "}
            page.
          </p>
        </div>
      )}
    </div>
  );
}
