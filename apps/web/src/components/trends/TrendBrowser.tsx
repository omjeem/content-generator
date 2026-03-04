"use client";

import { useState, useMemo } from "react";
import { TrendCard } from "./TrendCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { IDiscoveryTrend, ITrendDiscoveryResponse } from "@repo/shared-types";

const MAX_SELECTIONS = 5;

interface TrendBrowserProps {
  discovery: ITrendDiscoveryResponse;
  loading: boolean;
  onGenerate: (selectedTrendIds: string[]) => void;
  onRefresh: () => void;
  onCancel: () => void;
}

export function TrendBrowser({
  discovery,
  loading,
  onGenerate,
  onRefresh,
  onCancel,
}: TrendBrowserProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredTrends = useMemo(() => {
    if (!activeCategory) return discovery.trends;
    return discovery.trends.filter((t) => t.category === activeCategory);
  }, [discovery.trends, activeCategory]);

  const handleToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_SELECTIONS) {
        next.add(id);
      }
      return next;
    });
  };

  const atLimit = selectedIds.size >= MAX_SELECTIONS;

  return (
    <Card>
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Browse Trends
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Select 1-{MAX_SELECTIONS} trends to generate content about
            </p>
          </div>
          <div className="flex items-center gap-2">
            {discovery.isLive ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                Live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                Evergreen
              </span>
            )}
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {/* Category filter pills */}
        {discovery.categories.length > 1 && (
          <div className="flex gap-2 flex-wrap mb-4">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeCategory === null
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All ({discovery.trends.length})
            </button>
            {discovery.categories.map((cat) => {
              const count = discovery.trends.filter((t) => t.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeCategory === cat
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Trend list */}
        {filteredTrends.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            No trends in this category.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 max-h-[500px] overflow-y-auto pr-1">
            {filteredTrends.map((trend) => (
              <TrendCard
                key={trend.id}
                trend={trend}
                selected={selectedIds.has(trend.id)}
                disabled={atLimit && !selectedIds.has(trend.id)}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}

        {/* Selection counter + selection limit hint */}
        {atLimit && (
          <p className="mt-3 text-xs text-amber-600 text-center">
            Maximum {MAX_SELECTIONS} trends selected. Deselect one to choose another.
          </p>
        )}

        {/* Action buttons */}
        <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={() => onGenerate(Array.from(selectedIds))}
            disabled={selectedIds.size === 0 || loading}
          >
            {loading
              ? "Generating…"
              : `Generate from ${selectedIds.size} Trend${selectedIds.size !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
