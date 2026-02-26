"use client";

/**
 * Post Library Page — Phase E #29
 *
 * Route: /dashboard/posts
 *
 * Status tab bar: All | Drafting | Ready | Published
 * Paginated list of PostListItem rows.
 * [+ New Post] button creates a blank draft then navigates to editor.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PostListItem } from "@/components/posts/PostListItem";
import { Button } from "@/components/ui/button";
import { draftsApi, ApiError } from "@/lib/api";
import type { IPostDraft, DraftStatus } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type TabStatus = "all" | DraftStatus;

const TABS: { label: string; value: TabStatus }[] = [
  { label: "All", value: "all" },
  { label: "Drafting", value: "drafting" },
  { label: "Ready", value: "ready" },
  { label: "Published", value: "published" },
];

const PAGE_LIMIT = 10;

// ── Component ─────────────────────────────────────────────────────────────────

export default function PostsPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabStatus>("all");
  const [drafts, setDrafts] = useState<IPostDraft[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  // ── Fetch drafts whenever tab or page changes ─────────────────────────────
  const fetchDrafts = useCallback(
    async (tab: TabStatus, pg: number) => {
      setLoading(true);
      setLoadError(null);
      try {
        const result = await draftsApi.list({
          status: tab === "all" ? undefined : tab,
          page: pg,
          limit: PAGE_LIMIT,
        });
        setDrafts(result.data);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      } catch (err) {
        setLoadError(
          err instanceof ApiError ? err.message : "Failed to load drafts.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchDrafts(activeTab, page);
  }, [activeTab, page, fetchDrafts]);

  // ── Tab change — reset to page 1 ─────────────────────────────────────────
  function handleTabChange(tab: TabStatus) {
    setActiveTab(tab);
    setPage(1);
  }

  // ── Create new blank draft ────────────────────────────────────────────────
  async function handleNewPost() {
    if (creatingNew) return;
    setCreatingNew(true);
    try {
      const res = await draftsApi.create({
        title: "Untitled post",
        platform: "linkedin",
        content: "",
      });
      router.push(`/dashboard/editor?draftId=${res.draft._id}`);
    } catch (err) {
      console.error("[posts] Failed to create draft:", err);
      setCreatingNew(false);
    }
  }

  // ── Optimistic status update (from PostListItem) ──────────────────────────
  function handleStatusChange(id: string, newStatus: DraftStatus) {
    setDrafts((prev) =>
      prev.map((d) => (d._id === id ? { ...d, status: newStatus } : d)),
    );
    // If tab is filtered and the item no longer matches, remove it
    if (activeTab !== "all" && newStatus !== activeTab) {
      setDrafts((prev) => prev.filter((d) => d._id !== id));
      setTotal((t) => Math.max(0, t - 1));
    }
  }

  // ── Optimistic delete ─────────────────────────────────────────────────────
  function handleDelete(id: string) {
    setDrafts((prev) => prev.filter((d) => d._id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Posts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            All your drafts and published posts in one place
          </p>
        </div>
        <Button
          onClick={() => void handleNewPost()}
          disabled={creatingNew}
          className="gap-1.5"
        >
          {creatingNew ? (
            <>
              <span className="animate-spin">⟳</span> Creating…
            </>
          ) : (
            <>+ New Post</>
          )}
        </Button>
      </div>

      {/* ── Status tabs ───────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.value
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tab.value === activeTab && total > 0 && (
              <span className="ml-1.5 text-xs bg-indigo-100 text-indigo-600 rounded-full px-1.5 py-0.5">
                {total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content area ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-400">Loading posts…</p>
        </div>
      ) : loadError ? (
        <div className="text-center py-20">
          <p className="text-red-500 text-sm mb-3">{loadError}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchDrafts(activeTab, page)}
          >
            Retry
          </Button>
        </div>
      ) : drafts.length === 0 ? (
        <EmptyState tab={activeTab} onNewPost={() => void handleNewPost()} creatingNew={creatingNew} />
      ) : (
        <>
          {/* Draft list */}
          <div className="space-y-3">
            {drafts.map((draft) => (
              <PostListItem
                key={draft._id}
                draft={draft}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Previous
              </Button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages} ({total} total)
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({
  tab,
  onNewPost,
  creatingNew,
}: {
  tab: TabStatus;
  onNewPost: () => void;
  creatingNew: boolean;
}) {
  const messages: Record<TabStatus, { emoji: string; heading: string; sub: string }> = {
    all: {
      emoji: "✍️",
      heading: "No posts yet",
      sub: "Click \"+ New Post\" to create your first draft, or generate ideas from the Dashboard.",
    },
    drafting: {
      emoji: "📝",
      heading: "No drafts in progress",
      sub: "Start writing a new post or pick an idea from the Dashboard.",
    },
    ready: {
      emoji: "✅",
      heading: "No posts marked ready",
      sub: "Mark a draft as ready when it's polished and waiting to be published.",
    },
    published: {
      emoji: "🚀",
      heading: "Nothing published yet",
      sub: "Once you publish a draft, it will appear here.",
    },
  };

  const { emoji, heading, sub } = messages[tab];

  return (
    <div className="text-center py-20">
      <div className="text-4xl mb-3">{emoji}</div>
      <h3 className="text-base font-semibold text-gray-700 mb-1">{heading}</h3>
      <p className="text-sm text-gray-400 max-w-xs mx-auto mb-5">{sub}</p>
      {tab !== "published" && (
        <Button onClick={onNewPost} disabled={creatingNew} size="sm">
          {creatingNew ? "Creating…" : "+ New Post"}
        </Button>
      )}
    </div>
  );
}
