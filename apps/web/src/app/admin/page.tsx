"use client";

import { useEffect, useState, useCallback } from "react";
import {
  adminApi,
  type IAdminAnalyticsOverview,
  type IAdminTokenRequest,
} from "@/lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatCard({
  label,
  value,
  sub,
  color = "indigo",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: "indigo" | "green" | "amber" | "sky";
}) {
  const colorMap = {
    indigo: "bg-indigo-50 text-indigo-700",
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    sky: "bg-sky-50 text-sky-700",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500 font-medium mb-1">{label}</p>
      <p
        className={`text-3xl font-bold tabular-nums ${colorMap[color].split(" ")[1]}`}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Token request inline action ────────────────────────────────────────────────

function PendingRequestRow({
  req,
  onResolved,
}: {
  req: IAdminTokenRequest;
  onResolved: () => void;
}) {
  const user =
    typeof req.userId === "object"
      ? req.userId
      : { email: "Unknown", name: "", tokensUsed: 0, tokenLimit: 0 };
  const [newLimit, setNewLimit] = useState(String((user.tokenLimit ?? 0) + 50_000));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handle = async (action: "approve" | "reject") => {
    setLoading(true);
    setError("");
    try {
      if (action === "approve") {
        await adminApi.updateTokenRequest(req._id, {
          action: "approve",
          newLimit: parseInt(newLimit) || 150_000,
        });
      } else {
        await adminApi.updateTokenRequest(req._id, { action: "reject" });
      }
      onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
        <p className="text-xs text-gray-500">
          Used: {user.tokensUsed.toLocaleString()} /{" "}
          {(user.tokenLimit ?? 100_000).toLocaleString()}
        </p>
        {req.message && (
          <p className="text-xs text-gray-400 italic mt-0.5">
            &ldquo;{req.message}&rdquo;
          </p>
        )}
        {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number"
          value={newLimit}
          onChange={(e) => setNewLimit(e.target.value)}
          className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-xs text-center"
          placeholder="New limit"
        />
        <button
          onClick={() => handle("approve")}
          disabled={loading}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => handle("reject")}
          disabled={loading}
          className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState<IAdminAnalyticsOverview | null>(null);
  const [pendingRequests, setPendingRequests] = useState<IAdminTokenRequest[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ovRes, reqRes] = await Promise.all([
        adminApi.getAnalyticsOverview(),
        adminApi.getTokenRequests("pending"),
      ]);
      setOverview(ovRes);
      setPendingRequests(reqRes.requests);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard.");
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
        <div className="text-gray-400 text-sm">Loading dashboard…</div>
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Overview</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          System health and pending actions
        </p>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value={overview?.totalUsers ?? 0}
          color="indigo"
        />
        <StatCard
          label="Active This Week"
          value={overview?.activeThisWeek ?? 0}
          sub={`${overview?.activeThisMonth ?? 0} this month`}
          color="green"
        />
        <StatCard
          label="Total Tokens Used"
          value={
            overview?.totalTokensUsed
              ? `${(overview.totalTokensUsed / 1000).toFixed(1)}K`
              : "0"
          }
          color="sky"
        />
        <StatCard
          label="Pending Requests"
          value={overview?.pendingRequests ?? 0}
          color={
            (overview?.pendingRequests ?? 0) > 0 ? "amber" : "indigo"
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Pending token requests ───────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            🎟️ Pending Token Requests
            {pendingRequests.length > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5">
                {pendingRequests.length}
              </span>
            )}
          </h2>
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-gray-400">
              No pending requests — all clear! ✓
            </p>
          ) : (
            <div>
              {pendingRequests.map((req) => (
                <PendingRequestRow
                  key={req._id}
                  req={req}
                  onResolved={() => void load()}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Recent activity ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            🕐 Recent Activity
          </h2>
          {(overview?.recentActivity ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">No recent activity.</p>
          ) : (
            <div className="space-y-2">
              {(overview?.recentActivity ?? []).map((entry) => (
                <div
                  key={entry._id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-gray-700 truncate block">
                      {entry.userId?.email ?? "Unknown"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {entry.operation.replace(/_/g, " ")} ·{" "}
                      {entry.totalTokens.toLocaleString()} tokens
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 ml-3">
                    {timeAgo(entry.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Stats footer ───────────────────────────────────────────────────── */}
      <div className="text-xs text-gray-400 text-center">
        {overview?.totalSuggestions ?? 0} suggestion sets generated in total
      </div>
    </div>
  );
}
