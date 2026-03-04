"use client";

/**
 * Editor Page — Phase D #24
 *
 * Full-screen post editor with dual panes:
 * - Left pane: PostEditorPane (textarea + char counter + save buttons)
 * - Right pane: EditorChatPane (AI writing partner chat)
 *
 * URL params:
 *   ?draftId=<id>  — required, the draft to edit
 *
 * On first load with empty content: auto-sends "__INIT__" to generate
 * the first draft from the content brief.
 *
 * NOTE: useSearchParams() must be inside a <Suspense> boundary in Next.js 14.
 * The actual page content lives in EditorPageContent; EditorPage is a thin
 * wrapper that provides the Suspense boundary.
 */

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PostEditorPane } from "@/components/editor/PostEditorPane";
import { EditorChatPane } from "@/components/editor/EditorChatPane";
import { AiDetectorModal } from "@/components/editor/AiDetectorPanel";
import { draftsApi } from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { IPostDraft, DraftStatus, DraftPlatform } from "@/lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Loading fallback shown while useSearchParams resolves ─────────────────────

function EditorLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" />
        <p className="text-sm text-gray-500">Loading editor…</p>
      </div>
    </div>
  );
}

// ── Inner component — calls useSearchParams() safely inside Suspense ──────────

function EditorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draftId");

  // Draft state
  const [draft, setDraft] = useState<IPostDraft | null>(null);
  const [content, setContent] = useState("");
  const [platform, setPlatform] = useState<DraftPlatform>("linkedin");
  const [status, setStatus] = useState<DraftStatus>("drafting");
  const [title, setTitle] = useState("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // AI Detector modal state
  const [aiDetectorOpen, setAiDetectorOpen] = useState(false);

  // Chat history (loaded from server)
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Track if __INIT__ has been auto-sent
  const initSentRef = useRef(false);

  // ── Load draft + chat history on mount ──────────────────────────────────────
  useEffect(() => {
    if (!draftId) {
      setLoadError("No draft ID provided.");
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const [draftRes, historyRes] = await Promise.all([
          draftsApi.get(draftId),
          draftsApi.getHistory(draftId),
        ]);

        const d = draftRes.draft;
        setDraft(d);
        setContent(d.content ?? "");
        setPlatform(d.platform ?? "linkedin");
        setStatus(d.status ?? "drafting");
        setTitle(d.title ?? "");

        // Map server messages to chat format
        const msgs: ChatMessage[] = (historyRes.messages ?? [])
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
        setInitialMessages(msgs);
        setHistoryLoaded(true);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.status === 404
              ? "Draft not found."
              : err.message
            : "Failed to load draft.";
        setLoadError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [draftId]);

  // ── Auto-send __INIT__ when draft has no content and no chat history ─────────
  // We signal this to EditorChatPane via the autoInit prop.
  // EditorChatPane will call onApplyEdit when AI returns postContent.
  const shouldAutoInit =
    historyLoaded &&
    !initSentRef.current &&
    draft !== null &&
    draft.content.trim() === "" &&
    initialMessages.length === 0;

  if (shouldAutoInit) {
    initSentRef.current = true;
  }

  // ── Save draft ───────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!draftId || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const res = await draftsApi.update(draftId, { content, title });
      setDraft(res.draft);
      setStatus(res.draft.status);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : "Failed to save draft.",
      );
    } finally {
      setSaving(false);
    }
  }, [draftId, content, title, saving]);

  // ── Mark as ready ────────────────────────────────────────────────────────────
  const handleMarkReady = useCallback(async () => {
    if (!draftId || saving) return;
    setSaving(true);
    setSaveError(null);

    try {
      const res = await draftsApi.update(draftId, {
        content,
        title,
        status: "ready",
      });
      setDraft(res.draft);
      setStatus(res.draft.status);
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : "Failed to update status.",
      );
    } finally {
      setSaving(false);
    }
  }, [draftId, content, title, saving]);

  // ── Finalize (was Publish) ────────────────────────────────────────────────────
  const handleFinalize = useCallback(async () => {
    if (!draftId || finalizing) return;

    // Auto-save content before finalizing
    if (content !== draft?.content) {
      try {
        await draftsApi.update(draftId, { content, title });
      } catch {
        // Best-effort save — proceed with finalize anyway
      }
    }

    setFinalizing(true);
    setSaveError(null);

    try {
      const res = await draftsApi.publish(draftId);
      setDraft(res.draft);
      setStatus("published");
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : "Failed to finalize draft.",
      );
    } finally {
      setFinalizing(false);
    }
  }, [draftId, content, title, draft, finalizing]);

  // ── Apply AI edit (from EditorChatPane) ─────────────────────────────────────
  const handleApplyEdit = useCallback(
    (newContent: string) => {
      setContent(newContent);
      // Auto-save the AI-generated content
      if (draftId) {
        void draftsApi
          .update(draftId, { content: newContent, title })
          .then((res) => {
            setDraft(res.draft);
            setStatus(res.draft.status);
          })
          .catch(() => {
            // Silent fail — user can manually save
          });
      }
    },
    [draftId, title],
  );

  // ── Render states ────────────────────────────────────────────────────────────

  if (!draftId) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <p className="text-gray-500 text-sm mb-4">
          No draft selected. Please open a draft from the dashboard.
        </p>
        <Link
          href="/dashboard"
          className="text-indigo-600 hover:underline text-sm font-medium"
        >
          ← Go to Dashboard
        </Link>
      </div>
    );
  }

  if (loading) {
    return <EditorLoadingFallback />;
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <p className="text-red-500 text-sm mb-4">{loadError}</p>
        <Link
          href="/dashboard"
          className="text-indigo-600 hover:underline text-sm font-medium"
        >
          ← Go to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ minHeight: 0 }}>
      {/* ── Toolbar ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white shrink-0">
        {/* Left: back + title */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 hover:text-gray-700 shrink-0"
          >
            ← Dashboard
          </Link>
          <span className="text-gray-300 shrink-0">|</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (draftId && title !== draft?.title) {
                void draftsApi
                  .update(draftId, { title })
                  .then((res) => setDraft(res.draft))
                  .catch(() => {});
              }
            }}
            placeholder="Untitled draft…"
            className="text-sm font-medium text-gray-800 bg-transparent border-none outline-none truncate min-w-0 flex-1 placeholder-gray-400"
          />
        </div>

        {/* Right: platform badge + AI check + save status + finalize */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Save feedback */}
          {saveSuccess && (
            <span className="text-xs text-green-600 font-medium">✓ Saved</span>
          )}
          {saveError && (
            <span className="text-xs text-red-500 truncate max-w-[200px]">
              {saveError}
            </span>
          )}

          {/* Platform selector */}
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as DraftPlatform)}
            disabled={status === "published"}
            className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
          >
            <option value="linkedin">LinkedIn</option>
            <option value="twitter">Twitter/X</option>
          </select>

          {/* AI Detection button — opens modal */}
          {status !== "published" && (
            <button
              onClick={() => setAiDetectorOpen(true)}
              disabled={!content.trim() || content.trim().length < 50}
              className="text-xs border border-gray-200 hover:border-indigo-300 text-gray-600 hover:text-indigo-600 font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 flex items-center gap-1.5"
              title="Check for AI-generated patterns"
            >
              🔍 AI Check
            </button>
          )}

          {/* Finalize button (was Publish) */}
          {status !== "published" && (
            <button
              onClick={() => void handleFinalize()}
              disabled={finalizing || saving || !content.trim()}
              className="text-xs bg-green-600 hover:bg-green-700 text-white font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              {finalizing ? "Finalizing…" : "✅ Finalize"}
            </button>
          )}

          {status === "published" && (
            <span className="text-xs font-medium bg-green-100 text-green-700 px-3 py-1.5 rounded-md">
              ✓ Finalized
            </span>
          )}
        </div>
      </div>

      {/* ── Dual-pane editor ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-0 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left pane — PostEditorPane */}
        <div className="flex-1 p-4 overflow-y-auto border-r border-gray-100" style={{ minHeight: 0 }}>
          <PostEditorPane
            content={content}
            platform={platform}
            status={status}
            onChange={setContent}
            onSave={() => void handleSave()}
            onMarkReady={() => void handleMarkReady()}
            saving={saving}
          />
        </div>

        {/* Right pane — EditorChatPane: flex column, no outer scroll */}
        <div className="w-[360px] shrink-0 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
          {historyLoaded && draftId ? (
            <EditorChatPane
              draftId={draftId}
              onApplyEdit={handleApplyEdit}
              initialMessages={initialMessages}
              autoInit={shouldAutoInit}
              disabled={status === "published"}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="animate-pulse text-sm text-gray-400">
                Loading chat…
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── AI Detector Modal ─────────────────────────────────────────────────── */}
      {draftId && (
        <AiDetectorModal
          draftId={draftId}
          content={content}
          disabled={status === "published"}
          isOpen={aiDetectorOpen}
          onClose={() => setAiDetectorOpen(false)}
          onContentUpdated={(newContent) => {
            handleApplyEdit(newContent);
            // Keep modal open so user sees the result
          }}
        />
      )}
    </div>
  );
}

// ── Page export — Suspense wrapper required by Next.js 14 for useSearchParams ──

export default function EditorPage() {
  return (
    <Suspense fallback={<EditorLoadingFallback />}>
      <EditorPageContent />
    </Suspense>
  );
}
