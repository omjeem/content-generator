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

export function PostListItem({ draft, onStatusChange, onDelete }: PostListItemProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null); // which action is in flight
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
