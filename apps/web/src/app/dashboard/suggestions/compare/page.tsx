"use client";

/**
 * Suggestion Comparison View — Phase 4 #44
 *
 * Side-by-side comparison of two suggestion sets.
 * Accessed via /dashboard/suggestions/compare?a=<setId>&b=<setId>
 * or from the history page when selecting two sets.
 */

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SuggestionCard } from "@/components/suggestions/SuggestionCard";
import { Button } from "@/components/ui/button";
import { suggestionsApi, ApiError } from "@/lib/api";
import type { IContentSuggestion } from "@repo/shared-types";

const PAGE_LIMIT = 20;

export default function SuggestionComparePageWrapper() {
  return (
    <Suspense
      fallback={
        <main className="container max-w-7xl mx-auto px-4 py-8">
          <div className="h-64 rounded-xl bg-gray-100 animate-pulse" />
        </main>
      }
    >
      <SuggestionComparePage />
    </Suspense>
  );
}

function SuggestionComparePage() {
  const searchParams = useSearchParams();
  const aId = searchParams.get("a");
  const bId = searchParams.get("b");

  // Full set list for picker mode
  const [sets, setSets] = useState<IContentSuggestion[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);

  // Selected sets
  const [setA, setSetA] = useState<IContentSuggestion | null>(null);
  const [setB, setSetB] = useState<IContentSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Picker state (when no query params)
  const [pickingSlot, setPickingSlot] = useState<"a" | "b" | null>(null);
  const [selectedAId, setSelectedAId] = useState<string | null>(aId);
  const [selectedBId, setSelectedBId] = useState<string | null>(bId);

  // Load available sets for picker
  const loadSets = useCallback(async () => {
    setSetsLoading(true);
    try {
      const res = await suggestionsApi.list(1, PAGE_LIMIT);
      setSets(res.data);
    } catch {
      // non-fatal
    } finally {
      setSetsLoading(false);
    }
  }, []);

  // Load specific sets by ID
  const loadComparison = useCallback(
    async (idA: string, idB: string) => {
      setLoading(true);
      setError("");
      try {
        // Fetch both sets from the list and find them
        const res = await suggestionsApi.list(1, PAGE_LIMIT);
        setSets(res.data);

        const foundA = res.data.find((s) => s._id === idA);
        const foundB = res.data.find((s) => s._id === idB);

        if (!foundA || !foundB) {
          setError("One or both suggestion sets not found.");
        } else {
          setSetA(foundA);
          setSetB(foundB);
        }
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Failed to load sets.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (aId && bId) {
      loadComparison(aId, bId);
    } else {
      loadSets();
    }
  }, [aId, bId, loadComparison, loadSets]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function handlePickSet(setId: string) {
    if (pickingSlot === "a") {
      setSelectedAId(setId);
      const found = sets.find((s) => s._id === setId);
      if (found) setSetA(found);
    } else if (pickingSlot === "b") {
      setSelectedBId(setId);
      const found = sets.find((s) => s._id === setId);
      if (found) setSetB(found);
    }
    setPickingSlot(null);
  }

  const isComparing = setA !== null && setB !== null;

  return (
    <main className="container max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Compare Suggestion Sets
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Side-by-side comparison of two content idea batches
          </p>
        </div>
        <Link
          href="/dashboard/suggestions"
          className="text-sm text-indigo-600 hover:underline font-medium"
        >
          &larr; Back to History
        </Link>
      </div>

      {loading && (
        <div className="grid grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="h-64 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Picker UI — shown when sets are not yet selected */}
      {!loading && !isComparing && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Slot A */}
            <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center">
              {setA ? (
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">
                    Set A: {setA.suggestions.length} ideas
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(setA.generatedAt)}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs"
                    onClick={() => {
                      setSetA(null);
                      setSelectedAId(null);
                    }}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-gray-500 text-sm mb-3">
                    Select first set to compare
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPickingSlot("a")}
                  >
                    Choose Set A
                  </Button>
                </>
              )}
            </div>

            {/* Slot B */}
            <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center">
              {setB ? (
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">
                    Set B: {setB.suggestions.length} ideas
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(setB.generatedAt)}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs"
                    onClick={() => {
                      setSetB(null);
                      setSelectedBId(null);
                    }}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-gray-500 text-sm mb-3">
                    Select second set to compare
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPickingSlot("b")}
                  >
                    Choose Set B
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Compare button */}
          {setA && setB && (
            <div className="text-center">
              <p className="text-xs text-green-600 font-medium mb-2">
                Both sets selected! View the comparison below.
              </p>
            </div>
          )}

          {/* Picker dropdown */}
          {pickingSlot && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Choose Set {pickingSlot.toUpperCase()}
                </h3>
                <button
                  onClick={() => setPickingSlot(null)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>
              {setsLoading ? (
                <p className="text-sm text-gray-400">Loading sets...</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sets
                    .filter(
                      (s) =>
                        s._id !==
                        (pickingSlot === "a" ? selectedBId : selectedAId),
                    )
                    .map((s) => (
                      <button
                        key={s._id}
                        onClick={() => handlePickSet(s._id)}
                        className="w-full text-left rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30 p-3 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900">
                            {s.suggestions.length} ideas
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatDate(s.generatedAt)}
                          </span>
                        </div>
                        {s.trendsUsed.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {s.trendsUsed.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="text-[10px] bg-blue-50 text-blue-600 rounded-full px-1.5 py-0.5"
                              >
                                {t.length > 25 ? t.slice(0, 25) + "..." : t}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Side-by-side comparison */}
      {isComparing && (
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-6">
            <ComparisonHeader
              label="Set A"
              set={setA}
              formatDate={formatDate}
              color="indigo"
            />
            <ComparisonHeader
              label="Set B"
              set={setB}
              formatDate={formatDate}
              color="emerald"
            />
          </div>

          {/* Format comparison */}
          <div className="grid grid-cols-2 gap-6">
            <FormatBreakdown suggestions={setA.suggestions} color="indigo" />
            <FormatBreakdown suggestions={setB.suggestions} color="emerald" />
          </div>

          {/* Side-by-side cards */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-indigo-700 border-b border-indigo-200 pb-2">
                Set A Ideas ({setA.suggestions.length})
              </h3>
              {setA.suggestions.map((s, i) => (
                <SuggestionCard
                  key={String(s.hook ?? i)}
                  suggestion={s}
                  index={i}
                  suggestionSetId={setA._id}
                />
              ))}
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-emerald-700 border-b border-emerald-200 pb-2">
                Set B Ideas ({setB.suggestions.length})
              </h3>
              {setB.suggestions.map((s, i) => (
                <SuggestionCard
                  key={String(s.hook ?? i)}
                  suggestion={s}
                  index={i}
                  suggestionSetId={setB._id}
                />
              ))}
            </div>
          </div>

          {/* Reset comparison */}
          <div className="text-center pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setSetA(null);
                setSetB(null);
                setSelectedAId(null);
                setSelectedBId(null);
              }}
            >
              Compare Different Sets
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ComparisonHeader({
  label,
  set,
  formatDate,
  color,
}: {
  label: string;
  set: IContentSuggestion;
  formatDate: (iso: string) => string;
  color: "indigo" | "emerald";
}) {
  const borderColor =
    color === "indigo" ? "border-indigo-200" : "border-emerald-200";
  const bgColor =
    color === "indigo" ? "bg-indigo-50/50" : "bg-emerald-50/50";
  const textColor =
    color === "indigo" ? "text-indigo-700" : "text-emerald-700";

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-bold ${textColor}`}>{label}</span>
        <span className="text-xs text-gray-400">
          {formatDate(set.generatedAt)}
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-600">
        <span>{set.suggestions.length} ideas</span>
        <span>&middot;</span>
        <span>{set.trendsUsed.length} trends</span>
        {set.generationMode && (
          <>
            <span>&middot;</span>
            <span className="capitalize">{set.generationMode}</span>
          </>
        )}
      </div>
      {set.trendsUsed.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {set.trendsUsed.slice(0, 4).map((t) => (
            <span
              key={t}
              className="text-[10px] bg-white/70 text-gray-600 rounded-full px-2 py-0.5 border border-gray-200"
            >
              {t.length > 30 ? t.slice(0, 30) + "..." : t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FormatBreakdown({
  suggestions,
  color,
}: {
  suggestions: IContentSuggestion["suggestions"];
  color: "indigo" | "emerald";
}) {
  const counts = suggestions.reduce<Record<string, number>>((acc, s) => {
    acc[s.format] = (acc[s.format] ?? 0) + 1;
    return acc;
  }, {});

  const barColor =
    color === "indigo" ? "bg-indigo-500" : "bg-emerald-500";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Format Distribution
      </p>
      <div className="space-y-1.5">
        {Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([fmt, count]) => (
            <div key={fmt} className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} rounded-full`}
                  style={{
                    width: `${(count / suggestions.length) * 100}%`,
                  }}
                />
              </div>
              <span className="text-[11px] text-gray-600 w-28 text-right">
                {fmt} ({count})
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
