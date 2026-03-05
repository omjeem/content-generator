"use client";

/**
 * PostListItem — Phase E #30
 *
 * A single row in the post library. Shows:
 * - Title / first line of content
 * - Platform badge (LinkedIn / Twitter)
 * - Status chip (Drafting / Ready / Published)
 * - Char count
 * - "Last edited N ago" or "Published N ago"
 *
 * Action buttons vary by status:
 *   Drafting  → [Edit] [Mark Ready] [Delete]
 *   Ready     → [Edit] [Copy] [Mark Published]
 *   Published → [View] [Copy]
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { draftsApi, ApiError } from "@/lib/api";
import type { IPostDraft, DraftStatus } from "@/lib/api";

interface PostListItemProps {
  draft: IPostDraft;
  onStatusChange: (id: string, newStatus: DraftStatus) => void;
  onDelete: (id: string) => void;
  onPerformanceReported?: (id: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function getStatusStyles(status: DraftStatus): string {
  switch (status) {
    case "published":
      return "bg-green-100 text-green-700";
    case "ready":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-gray-100 text-gray-500";
  }
}

function getStatusLabel(status: DraftStatus): string {
  switch (status) {
    case "published":
      return "✓ Published";
    case "ready":
      return "Ready";
    default:
      return "Drafting";
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PostListItem({ draft, onStatusChange, onDelete, onPerformanceReported }: PostListItemProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null); // which action is in flight
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase 4 #42: Performance reporting state
  const [perfOpen, setPerfOpen] = useState(false);
  const [perfLikes, setPerfLikes] = useState("");
  const [perfComments, setPerfComments] = useState("");
  const [perfReposts, setPerfReposts] = useState("");
  const [perfImpressions, setPerfImpressions] = useState("");
  const [perfSubmitting, setPerfSubmitting] = useState(false);
  const [perfSubmitted, setPerfSubmitted] = useState(!!draft.performanceData);

  // Display title: prefer explicit title, else first line of content
  const displayTitle =
    draft.title?.trim() ||
    draft.content?.split("\n")[0]?.slice(0, 80) ||
    "Untitled draft";

  // Preview snippet: second line or a portion of content
  const preview = draft.content
    ? draft.content.replace(/\n+/g, " ").slice(0, 120)
    : draft.brief?.topic ?? "";

  const isTwitter = draft.platform === "twitter";
  const timeLabel = draft.publishedAt
    ? `Published ${timeAgo(draft.publishedAt)}`
    : `Edited ${timeAgo(draft.updatedAt)}`;

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleEdit = useCallback(() => {
    router.push(`/dashboard/editor?draftId=${draft._id}`);
  }, [router, draft._id]);

  const handleCopy = useCallback(async () => {
    if (!draft.content) return;
    try {
      await navigator.clipboard.writeText(draft.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }, [draft.content]);

  const handleMarkReady = useCallback(async () => {
    setLoading("ready");
    setError(null);
    try {
      const res = await draftsApi.update(draft._id, { status: "ready" });
      onStatusChange(draft._id, res.draft.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update.");
    } finally {
      setLoading(null);
    }
  }, [draft._id, onStatusChange]);

  const handlePublish = useCallback(async () => {
    setLoading("publish");
    setError(null);
    try {
      const res = await draftsApi.publish(draft._id);
      onStatusChange(draft._id, res.draft.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to publish.");
    } finally {
      setLoading(null);
    }
  }, [draft._id, onStatusChange]);

  const handleDelete = useCallback(async () => {
    if (!confirm("Delete this draft? This cannot be undone.")) return;
    setLoading("delete");
    setError(null);
    try {
      await draftsApi.delete(draft._id);
      onDelete(draft._id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete.");
      setLoading(null);
    }
  }, [draft._id, onDelete]);

  // Phase 4 #42: Report post performance
  const handleReportPerformance = useCallback(async () => {
    setPerfSubmitting(true);
    setError(null);
    try {
      await draftsApi.reportPerformance(draft._id, {
        likes: parseInt(perfLikes) || 0,
        comments: parseInt(perfComments) || 0,
        reposts: parseInt(perfReposts) || 0,
        impressions: perfImpressions ? parseInt(perfImpressions) : undefined,
      });
      setPerfSubmitted(true);
      setPerfOpen(false);
      onPerformanceReported?.(draft._id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save performance data.");
    } finally {
      setPerfSubmitting(false);
    }
  }, [draft._id, perfLikes, perfComments, perfReposts, perfImpressions, onPerformanceReported]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors p-4">
      <div className="flex items-start gap-4">
        {/* Main content area */}
        <div className="flex-1 min-w-0">
          {/* Header row: title + badges */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {displayTitle}
            </h3>
            {/* Platform badge */}
            <span
              className={cn(
                "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                isTwitter
                  ? "bg-sky-100 text-sky-700"
                  : "bg-indigo-100 text-indigo-700",
              )}
            >
              {isTwitter ? "𝕏 Twitter" : "in LinkedIn"}
            </span>
            {/* Status badge */}
            <span
              className={cn(
                "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                getStatusStyles(draft.status),
              )}
            >
              {getStatusLabel(draft.status)}
            </span>
          </div>

          {/* Content preview */}
          {preview && (
            <p className="text-xs text-gray-500 line-clamp-1 mb-1.5">
              {preview}
            </p>
          )}

          {/* Meta row: char count + time */}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>{draft.charCount.toLocaleString()} chars</span>
            <span>·</span>
            <span>{timeLabel}</span>
            {draft.brief?.topic && (
              <>
                <span>·</span>
                <span className="text-gray-400 truncate max-w-[180px]">
                  {draft.brief.topic}
                </span>
              </>
            )}
          </div>

          {/* Inline error */}
          {error && (
            <p className="mt-1 text-xs text-red-500">{error}</p>
          )}
        </div>

        {/* Action buttons — right side */}
        <div className="shrink-0 flex items-center gap-1.5">
          {draft.status === "drafting" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 px-2.5"
                onClick={handleEdit}
              >
                ✏️ Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 px-2.5"
                onClick={() => void handleMarkReady()}
                disabled={loading === "ready"}
              >
                {loading === "ready" ? "…" : "✅ Mark Ready"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => void handleDelete()}
                disabled={loading === "delete"}
              >
                {loading === "delete" ? "…" : "🗑️"}
              </Button>
            </>
          )}

          {draft.status === "ready" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 px-2.5"
                onClick={handleEdit}
              >
                ✏️ Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 px-2.5"
                onClick={() => void handleCopy()}
              >
                {copied ? "✓ Copied" : "📋 Copy"}
              </Button>
              <Button
                size="sm"
                className="text-xs h-7 px-2.5 bg-green-600 hover:bg-green-700"
                onClick={() => void handlePublish()}
                disabled={loading === "publish"}
              >
                {loading === "publish" ? "…" : "🚀 Publish"}
              </Button>
            </>
          )}

          {draft.status === "published" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 px-2.5"
                onClick={handleEdit}
              >
                👁️ View
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 px-2.5"
                onClick={() => void handleCopy()}
              >
                {copied ? "✓ Copied" : "📋 Copy"}
              </Button>
              {/* Phase 4 #42: Report performance button */}
              {!perfSubmitted && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 px-2.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => setPerfOpen((o) => !o)}
                >
                  📊 Report
                </Button>
              )}
              {perfSubmitted && (
                <span className="text-[11px] text-green-600 font-medium flex items-center gap-1">
                  ✓ Reported
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Phase 4 #42: Performance reporting form for published drafts */}
      {draft.status === "published" && perfOpen && !perfSubmitted && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-600 mb-2">
            How did this post perform? (helps improve future suggestions)
          </p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Likes</label>
              <input
                type="number"
                min="0"
                value={perfLikes}
                onChange={(e) => setPerfLikes(e.target.value)}
                className="w-20 h-7 text-xs rounded border border-gray-200 px-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Comments</label>
              <input
                type="number"
                min="0"
                value={perfComments}
                onChange={(e) => setPerfComments(e.target.value)}
                className="w-20 h-7 text-xs rounded border border-gray-200 px-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Reposts</label>
              <input
                type="number"
                min="0"
                value={perfReposts}
                onChange={(e) => setPerfReposts(e.target.value)}
                className="w-20 h-7 text-xs rounded border border-gray-200 px-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Impressions (opt)</label>
              <input
                type="number"
                min="0"
                value={perfImpressions}
                onChange={(e) => setPerfImpressions(e.target.value)}
                className="w-24 h-7 text-xs rounded border border-gray-200 px-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                placeholder="optional"
              />
            </div>
            <Button
              size="sm"
              className="text-xs h-7 px-3"
              onClick={() => void handleReportPerformance()}
              disabled={perfSubmitting}
            >
              {perfSubmitting ? "Saving…" : "Save"}
            </Button>
            <button
              onClick={() => setPerfOpen(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Performance data display for already-reported drafts */}
      {draft.status === "published" && draft.performanceData && (
        <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
          <span>📊</span>
          <span>{draft.performanceData.likes} likes</span>
          <span>·</span>
          <span>{draft.performanceData.comments} comments</span>
          <span>·</span>
          <span>{draft.performanceData.reposts} reposts</span>
          {draft.performanceData.impressions !== undefined && (
            <>
              <span>·</span>
              <span>{draft.performanceData.impressions.toLocaleString()} impressions</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
