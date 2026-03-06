"use client";

/**
 * Persona Evolution Timeline — Phase 4 #45
 *
 * Shows the user how their persona has changed over time.
 * Each entry = one analysis snapshot (initial + re-analyses after adding posts).
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { personaApi, ApiError } from "@/lib/api";

interface TimelineEntry {
  version: number;
  snapshotAt: string;
  trigger: string;
  snapshot: {
    writingStyle?: string;
    tone?: string;
    topics: string[];
    postFormats?: string[];
    contentPillars?: string[];
  };
  isCurrent?: boolean;
}

export default function PersonaEvolutionPage() {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    personaApi
      .getHistory()
      .then((res) => {
        setTimeline(res.timeline);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError ? err.message : "Failed to load timeline.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

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
    <main className="container max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Persona Evolution
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            How your content voice has developed over time
          </p>
        </div>
        <Link
          href="/dashboard/profile"
          className="text-sm text-indigo-600 hover:underline font-medium"
        >
          &larr; Back to Profile
        </Link>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && timeline.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <div className="text-4xl mb-3">&#128336;</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            No history yet
          </h2>
          <p className="text-gray-500 text-sm">
            Your persona evolution will appear here after you add more posts or re-analyze your profile.
          </p>
        </div>
      )}

      {/* Timeline */}
      {!loading && !error && timeline.length > 0 && (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-gray-200" />

          <div className="space-y-8">
            {timeline.map((entry, idx) => (
              <div key={idx} className="relative flex gap-4">
                {/* Timeline dot */}
                <div className="relative z-10 shrink-0 flex items-center justify-center w-12">
                  <div
                    className={`w-4 h-4 rounded-full border-2 ${
                      entry.isCurrent
                        ? "bg-indigo-600 border-indigo-600"
                        : "bg-white border-gray-300"
                    }`}
                  />
                </div>

                {/* Card */}
                <div
                  className={`flex-1 rounded-xl border p-5 ${
                    entry.isCurrent
                      ? "border-indigo-200 bg-indigo-50/30"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">
                        v{entry.version}
                      </span>
                      {entry.isCurrent && (
                        <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[11px] font-semibold">
                          Current
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
                      {formatDate(entry.snapshotAt)}
                    </span>
                  </div>

                  {/* Trigger */}
                  <p className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
                    <span>&#9889;</span>
                    {entry.trigger}
                  </p>

                  {/* Snapshot details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {entry.snapshot.writingStyle && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                          Writing Style
                        </p>
                        <p className="text-sm text-gray-700">
                          {entry.snapshot.writingStyle.length > 80
                            ? entry.snapshot.writingStyle.slice(0, 80) + "..."
                            : entry.snapshot.writingStyle}
                        </p>
                      </div>
                    )}

                    {entry.snapshot.tone && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                          Tone
                        </p>
                        <p className="text-sm text-gray-700">
                          {entry.snapshot.tone.length > 80
                            ? entry.snapshot.tone.slice(0, 80) + "..."
                            : entry.snapshot.tone}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Topics */}
                  {entry.snapshot.topics?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                        Topics
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {entry.snapshot.topics.slice(0, 8).map((topic) => (
                          <span
                            key={topic}
                            className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[11px] font-medium"
                          >
                            {topic}
                          </span>
                        ))}
                        {entry.snapshot.topics.length > 8 && (
                          <span className="text-[11px] text-gray-400">
                            +{entry.snapshot.topics.length - 8} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Content Pillars (current version only) */}
                  {entry.snapshot.contentPillars &&
                    entry.snapshot.contentPillars.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                          Content Pillars
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {entry.snapshot.contentPillars.map((pillar) => (
                            <span
                              key={pillar}
                              className="inline-flex items-center rounded-full bg-purple-50 text-purple-700 px-2 py-0.5 text-[11px] font-medium"
                            >
                              {pillar}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Post Formats */}
                  {entry.snapshot.postFormats &&
                    entry.snapshot.postFormats.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                          Post Formats
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {entry.snapshot.postFormats.map((fmt) => (
                            <span
                              key={fmt}
                              className="inline-flex items-center rounded-full bg-green-50 text-green-700 px-2 py-0.5 text-[11px] font-medium"
                            >
                              {fmt}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Diff indicator for non-first entries */}
                  {idx > 0 && !entry.isCurrent && (
                    <div className="mt-3 pt-2 border-t border-gray-100">
                      <DiffSummary
                        prev={timeline[idx - 1]!.snapshot}
                        curr={entry.snapshot}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

// ── Diff Summary ───────────────────────────────────────────────────────────────

function DiffSummary({
  prev,
  curr,
}: {
  prev: TimelineEntry["snapshot"];
  curr: TimelineEntry["snapshot"];
}) {
  const added = curr.topics.filter((t) => !prev.topics.includes(t));
  const removed = prev.topics.filter((t) => !curr.topics.includes(t));
  const toneChanged = prev.tone !== curr.tone;

  if (added.length === 0 && removed.length === 0 && !toneChanged) return null;

  return (
    <div className="text-[11px] text-gray-500 space-y-0.5">
      {added.length > 0 && (
        <p>
          <span className="text-green-600 font-medium">+ Topics added:</span>{" "}
          {added.slice(0, 3).join(", ")}
          {added.length > 3 ? ` +${added.length - 3}` : ""}
        </p>
      )}
      {removed.length > 0 && (
        <p>
          <span className="text-red-500 font-medium">- Topics removed:</span>{" "}
          {removed.slice(0, 3).join(", ")}
          {removed.length > 3 ? ` +${removed.length - 3}` : ""}
        </p>
      )}
      {toneChanged && (
        <p>
          <span className="text-amber-600 font-medium">~ Tone:</span>{" "}
          {prev.tone ?? "none"} &rarr; {curr.tone ?? "none"}
        </p>
      )}
    </div>
  );
}
