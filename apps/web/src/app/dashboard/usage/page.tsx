"use client";
import { useState, useEffect, useCallback } from "react";
import { tokenApi } from "@/lib/api";
import type {
  ITokenUsageSummary,
  ITokenUsageLog,
  OperationType,
} from "@repo/shared-types";

// ── Human-readable labels ─────────────────────────────────────────────────────

const OPERATION_LABELS: Record<OperationType, string> = {
  persona_analysis: "Persona Analysis",
  onboarding_chat: "Onboarding Chat",
  trend_research: "Trend Research",
  content_generation: "Content Generation",
  persona_chat: "Persona Chat",
  refine_context: "Context Refinement",
};

// ── Helper ────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getBarColor(percent: number): string {
  if (percent >= 100) return "bg-red-500";
  if (percent >= 80) return "bg-amber-500";
  return "bg-[#0A66C2]";
}

function getPercentTextColor(percent: number): string {
  if (percent >= 100) return "text-red-600";
  if (percent >= 80) return "text-amber-600";
  return "text-[#0A66C2]";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TokenUsagePage() {
  const [summary, setSummary] = useState<ITokenUsageSummary | null>(null);
  const [logs, setLogs] = useState<ITokenUsageLog[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const LIMIT = 20;

  const fetchData = useCallback(async (currentPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const [usageData, logsData] = await Promise.all([
        tokenApi.getUsage(),
        tokenApi.getLogs(currentPage, LIMIT),
      ]);
      setSummary(usageData);
      setLogs(logsData.data);
      setTotalPages(logsData.totalPages);
      setTotal(logsData.total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load token usage data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(page);
  }, [page, fetchData]);

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-linkedin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading token usage...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Token Usage</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track your AI token consumption across all operations
        </p>
      </div>

      {/* Summary card */}
      {summary && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Lifetime Usage</h2>
            <span
              className={`text-lg font-bold ${getPercentTextColor(summary.percentUsed)}`}
            >
              {summary.percentUsed}%
            </span>
          </div>

          {/* Progress bar */}
          <div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getBarColor(summary.percentUsed)}`}
                style={{ width: `${Math.min(100, summary.percentUsed)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-gray-500">0</span>
              <span className="text-xs text-gray-500">
                {summary.tokenLimit.toLocaleString()} tokens
              </span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-gray-50 p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">
                {summary.tokensUsed.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">Tokens Used</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-4 text-center">
              <div
                className={`text-2xl font-bold ${summary.tokensRemaining === 0 ? "text-red-600" : "text-gray-900"}`}
              >
                {summary.tokensRemaining.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">Tokens Remaining</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">
                {summary.tokenLimit.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">Total Limit</div>
            </div>
          </div>

          {/* Warning banners */}
          {summary.percentUsed >= 100 && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <span className="text-red-500 text-lg leading-none">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-red-700">
                  Token quota exceeded
                </p>
                <p className="text-sm text-red-600 mt-0.5">
                  You have used all available tokens. AI operations are
                  currently blocked. Please contact support to increase your
                  limit.
                </p>
              </div>
            </div>
          )}
          {summary.percentUsed >= 80 && summary.percentUsed < 100 && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <span className="text-amber-500 text-lg leading-none">⚡</span>
              <div>
                <p className="text-sm font-semibold text-amber-700">
                  Approaching token limit
                </p>
                <p className="text-sm text-amber-600 mt-0.5">
                  You have used {summary.percentUsed}% of your token quota.
                  {summary.tokensRemaining.toLocaleString()} tokens remaining.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Operations log */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Operation Log</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {total.toLocaleString()} total operations
            </p>
          </div>
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-linkedin" />
          )}
        </div>

        {logs.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            No operations recorded yet. Start using the AI features to see usage
            here.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <th className="px-6 py-3">Operation</th>
                    <th className="px-6 py-3 text-right">Input</th>
                    <th className="px-6 py-3 text-right">Output</th>
                    <th className="px-6 py-3 text-right">Total</th>
                    <th className="px-6 py-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr
                      key={log._id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-3.5">
                        <span className="font-medium text-gray-800">
                          {OPERATION_LABELS[log.operation] ?? log.operation}
                        </span>
                        <span className="ml-2 text-xs text-gray-400">
                          {log.agent}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right text-gray-600 tabular-nums">
                        {log.inputTokens.toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5 text-right text-gray-600 tabular-nums">
                        {log.outputTokens.toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5 text-right font-semibold text-gray-900 tabular-nums">
                        {log.totalTokens.toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5 text-right text-gray-400 whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Previous
                </button>
                <span className="text-sm text-gray-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || loading}
                  className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
