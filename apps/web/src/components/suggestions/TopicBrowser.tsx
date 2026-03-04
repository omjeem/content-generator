"use client";

/**
 * TopicBrowser — Phase 3 #32
 *
 * Displays AI-suggested topics from the user's persona with category filters,
 * confidence scores, and single-topic selection for content generation.
 */

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface TopicItem {
  id: string;
  title: string;
  category: string;
  reasoning: string;
  suggestedFormat: string;
  confidence: number;
}

interface TopicBrowserProps {
  topics: TopicItem[];
  loading: boolean;
  onSelect: (topicId: string, topicTitle: string) => void;
  onRefresh: () => void;
  onCancel: () => void;
}

const FORMAT_ICONS: Record<string, string> = {
  carousel: "📊",
  "text-post": "📝",
  poll: "📊",
  "video-script": "🎬",
  list: "📋",
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80
      ? "bg-green-500"
      : pct >= 60
        ? "bg-amber-500"
        : "bg-gray-400";

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-400 font-medium">{pct}%</span>
    </div>
  );
}

export function TopicBrowser({
  topics,
  loading,
  onSelect,
  onRefresh,
  onCancel,
}: TopicBrowserProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = Array.from(new Set(topics.map((t) => t.category))).sort();
    return ["all", ...cats];
  }, [topics]);

  // Filter by category
  const filtered = useMemo(() => {
    if (activeCategory === "all") return topics;
    return topics.filter((t) => t.category === activeCategory);
  }, [topics, activeCategory]);

  const selectedTopic = topics.find((t) => t.id === selectedId);

  return (
    <Card>
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              AI Topic Suggestions
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Topics based on your persona, expertise, and audience
            </p>
          </div>
          <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
            Persona-driven
          </span>
        </div>

        {/* Category filter pills */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                activeCategory === cat
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat === "all" ? "All" : cat}
            </button>
          ))}
        </div>

        {/* Topic list */}
        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
          {filtered.map((topic) => {
            const isSelected = selectedId === topic.id;
            return (
              <button
                key={topic.id}
                onClick={() =>
                  setSelectedId(isSelected ? null : topic.id)
                }
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Radio indicator */}
                  <div
                    className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-600"
                        : "border-gray-300"
                    }`}
                  >
                    {isSelected && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 leading-snug">
                      {topic.title}
                    </p>

                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        {topic.category}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {FORMAT_ICONS[topic.suggestedFormat] ?? "📝"}{" "}
                        {topic.suggestedFormat}
                      </span>
                      <ConfidenceBar value={topic.confidence} />
                    </div>

                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                      {topic.reasoning}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              No topics in this category.
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Suggest More"}
            </Button>
          </div>

          <Button
            size="sm"
            onClick={() => {
              if (selectedTopic) {
                onSelect(selectedTopic.id, selectedTopic.title);
              }
            }}
            disabled={!selectedId || loading}
          >
            {loading
              ? "Generating…"
              : `Generate Posts About This Topic`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
