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

  // Gemini 2.5 Flash pricing estimate
  // Input: $0.075 / 1M tokens · Output: $0.30 / 1M tokens
  // Blended ~75% input / 25% output → ~$0.131 / 1M tokens
  const COST_PER_M_TOKENS = 0.131;
  const USD_TO_INR = 83.5; // approximate rate
  const estimatedCostAllTime = ((overview?.totalTokensUsed ?? 0) / 1_000_000) * COST_PER_M_TOKENS;
  const estimatedCost30d = (tokens30d / 1_000_000) * COST_PER_M_TOKENS;
  const costPerOp30d = ops30d > 0 ? estimatedCost30d / ops30d : 0;
  const costPerUser30d = (overview?.totalUsers ?? 0) > 0
    ? estimatedCost30d / (overview?.totalUsers ?? 1)
    : 0;

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

      {/* ── Cost estimates ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            💰 Estimated API Cost (Gemini 2.5 Flash)
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
              $0.075 input · $0.30 output per 1M tokens
            </span>
            <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
              1 USD ≈ ₹{USD_TO_INR}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* All-time */}
          <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
            <p className="text-xs text-emerald-600 font-medium mb-1">All-time estimated</p>
            <p className="text-xl font-bold text-emerald-700 tabular-nums">
              ${estimatedCostAllTime.toFixed(4)}
            </p>
            <p className="text-sm font-semibold text-emerald-600 tabular-nums">
              ₹{(estimatedCostAllTime * USD_TO_INR).toFixed(2)}
            </p>
            <p className="text-xs text-emerald-500 mt-1">
              {((overview?.totalTokensUsed ?? 0) / 1_000_000).toFixed(3)}M tokens
            </p>
          </div>
          {/* Last 30 days */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <p className="text-xs text-blue-600 font-medium mb-1">Last 30 days</p>
            <p className="text-xl font-bold text-blue-700 tabular-nums">
              ${estimatedCost30d.toFixed(4)}
            </p>
            <p className="text-sm font-semibold text-blue-600 tabular-nums">
              ₹{(estimatedCost30d * USD_TO_INR).toFixed(2)}
            </p>
            <p className="text-xs text-blue-500 mt-1">
              {(tokens30d / 1_000_000).toFixed(3)}M tokens
            </p>
          </div>
          {/* Cost per operation */}
          <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
            <p className="text-xs text-amber-600 font-medium mb-1">Cost per operation</p>
            <p className="text-xl font-bold text-amber-700 tabular-nums">
              ${(costPerOp30d * 100).toFixed(4)}¢
            </p>
            <p className="text-sm font-semibold text-amber-600 tabular-nums">
              ₹{(costPerOp30d * USD_TO_INR).toFixed(4)}
            </p>
            <p className="text-xs text-amber-500 mt-1">avg per AI call (30d)</p>
          </div>
          {/* Cost per user/month */}
          <div className="bg-violet-50 rounded-lg p-4 border border-violet-100">
            <p className="text-xs text-violet-600 font-medium mb-1">Cost per user/month</p>
            <p className="text-xl font-bold text-violet-700 tabular-nums">
              ${costPerUser30d.toFixed(4)}
            </p>
            <p className="text-sm font-semibold text-violet-600 tabular-nums">
              ₹{(costPerUser30d * USD_TO_INR).toFixed(2)}
            </p>
            <p className="text-xs text-violet-500 mt-1">
              avg across {overview?.totalUsers ?? 0} users
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          * Blended estimate ~75% input / ~25% output token split. Exchange rate: 1 USD = ₹{USD_TO_INR}. Actual costs may vary.
        </p>
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
