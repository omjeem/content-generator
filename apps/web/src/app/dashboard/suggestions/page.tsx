"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { SuggestionCard } from "@/components/suggestions/SuggestionCard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { suggestionsApi, ApiError } from "@/lib/api";
import type { IContentSuggestion } from "@repo/shared-types";

const PAGE_LIMIT = 5;

export default function SuggestionsHistoryPage() {
  const [sets, setSets] = useState<IContentSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await suggestionsApi.list(p, PAGE_LIMIT);
      setSets(res.data);
      setTotalPages(res.totalPages);
      setPage(res.page);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load history.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <main className="container max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Suggestions History
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            All your previously generated content idea sets
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-indigo-600 hover:underline font-medium"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
          {error}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchPage(page)}
            className="ml-4"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && sets.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="text-4xl mb-3">📋</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              No suggestions yet
            </h2>
            <p className="text-gray-500 text-sm mb-4">
              Generate your first batch of content ideas from the dashboard.
            </p>
            <Button asChild>
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Suggestion sets */}
      {!loading && !error && sets.length > 0 && (
        <div className="space-y-6">
          {sets.map((set) => (
            <Card key={set._id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base font-semibold text-gray-900">
                      {set.suggestions.length} Ideas Generated
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      {formatDate(set.generatedAt)}
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setExpandedId(expandedId === set._id ? null : set._id)
                    }
                  >
                    {expandedId === set._id ? "Collapse" : "View Ideas"}
                  </Button>
                </div>

                {/* Trends used */}
                {set.trendsUsed.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {set.trendsUsed.map((t) => (
                      <span
                        key={t}
                        className="inline-block px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Format breakdown */}
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-gray-500">
                  {Object.entries(
                    set.suggestions.reduce<Record<string, number>>((acc, s) => {
                      acc[s.format] = (acc[s.format] ?? 0) + 1;
                      return acc;
                    }, {}),
                  ).map(([fmt, count]) => (
                    <span key={fmt}>
                      {count}× {fmt}
                    </span>
                  ))}
                </div>
              </CardHeader>

              {/* Expandable suggestions */}
              {expandedId === set._id && (
                <CardContent className="pt-0 pb-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 items-start">
                    {set.suggestions.map((s, i) => (
                      <SuggestionCard
                        key={String(s.hook ?? i)}
                        suggestion={s}
                        index={i}
                        suggestionSetId={set._id}
                      />
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => fetchPage(page - 1)}
              >
                ← Previous
              </Button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => fetchPage(page + 1)}
              >
                Next →
              </Button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
