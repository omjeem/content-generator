"use client";
import { useState, useEffect } from "react";
import { personaApi, ApiError } from "@/lib/api";
import type { IPostBatchMetadata } from "@repo/shared-types";

// ── Source labels ─────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  manual: "Pasted manually",
  "linkedin-scrape": "LinkedIn scrape",
  "add-posts": "Added posts",
};

const SOURCE_ICONS: Record<string, string> = {
  manual: "✏️",
  "linkedin-scrape": "🔗",
  "add-posts": "➕",
};

// ── Relative date helper ──────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PostBatchHistoryProps {
  /** Pre-loaded batches from parent (e.g. from IUserPersona.postMetadata). */
  batches?: IPostBatchMetadata[];
  /** Total posts analyzed count to display in the header. */
  totalPostsAnalyzed?: number;
  /** If true, the component fetches its own data from GET /api/persona/posts. */
  fetchOnMount?: boolean;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PostBatchHistory({
  batches: initialBatches,
  totalPostsAnalyzed: initialTotal,
  fetchOnMount = false,
  className = "",
}: PostBatchHistoryProps) {
  const [batches, setBatches] = useState<IPostBatchMetadata[]>(
    initialBatches ?? [],
  );
  const [totalPostsAnalyzed, setTotalPostsAnalyzed] = useState(
    initialTotal ?? 0,
  );
  const [loading, setLoading] = useState(fetchOnMount);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!fetchOnMount) return;
    setLoading(true);
    personaApi
      .getPosts()
      .then((res) => {
        // Map the response batches to IPostBatchMetadata shape
        const mapped: IPostBatchMetadata[] = (res.batches ?? []).map((b) => ({
          batchId: b.batchId,
          addedAt: b.addedAt,
          postCount: b.postCount,
          source: b.source as IPostBatchMetadata["source"],
        }));
        setBatches(mapped);
        setTotalPostsAnalyzed(res.totalPostsAnalyzed ?? 0);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError
            ? err.message
            : "Failed to load batch history",
        );
      })
      .finally(() => setLoading(false));
  }, [fetchOnMount]);

  if (loading) {
    return (
      <div className={`space-y-2 animate-pulse ${className}`}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 ${className}`}
      >
        {error}
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <p className={`text-xs text-gray-400 italic ${className}`}>
        No post batches recorded yet.
      </p>
    );
  }

  // Sort newest-first
  const sorted = [...batches].sort(
    (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(),
  );

  return (
    <div className={className}>
      {/* Summary header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">Post batches</span>
        <span className="text-xs text-gray-400">
          {totalPostsAnalyzed} post{totalPostsAnalyzed !== 1 ? "s" : ""} total
        </span>
      </div>

      {/* Timeline */}
      <ol className="relative border-l border-gray-200 ml-2 space-y-0">
        {sorted.map((batch, idx) => (
          <li key={batch.batchId} className="mb-3 ml-4">
            {/* Timeline dot */}
            <span
              className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white ${
                idx === 0 ? "bg-linkedin" : "bg-gray-300"
              }`}
            />
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-base leading-none shrink-0">
                  {SOURCE_ICONS[batch.source] ?? "📄"}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">
                    {batch.postCount} post{batch.postCount !== 1 ? "s" : ""}{" "}
                    <span className="font-normal text-gray-400">
                      · {SOURCE_LABELS[batch.source] ?? batch.source}
                    </span>
                  </p>
                  <p className="text-xs text-gray-400">
                    {relativeDate(batch.addedAt)}
                  </p>
                </div>
              </div>
              {idx === 0 && (
                <span className="text-xs font-semibold text-linkedin bg-blue-50 px-1.5 py-0.5 rounded shrink-0">
                  Latest
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
