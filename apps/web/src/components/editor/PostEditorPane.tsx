"use client";

/**
 * PostEditorPane — Phase D #25 / Phase F #36
 *
 * The left pane of the editor page. Contains:
 * - Controlled textarea with real-time character count
 * - Platform-aware char counter (LinkedIn 3000 / Twitter 280)
 * - Twitter: single-tweet mode (≤280) or thread editor mode (>280)
 *   - Thread editor: one textarea per tweet, 280-char counter per box,
 *     [+ Add Tweet] / [✕ Remove] controls, collapsed auto-split preview
 * - Save Draft, Mark Ready, Copy to Clipboard buttons
 */

import { useCallback, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DraftPlatform, DraftStatus } from "@/lib/api";

interface PostEditorPaneProps {
  content: string;
  platform: DraftPlatform;
  status: DraftStatus;
  onChange: (content: string) => void;
  onSave: () => void;
  onMarkReady: () => void;
  saving?: boolean;
  readOnly?: boolean;
}

const LINKEDIN_MAX = 3000;
const TWITTER_MAX = 280;

/**
 * Split content into tweet-sized chunks.
 * Splits on double newlines (paragraphs) first, then hard-cuts if needed.
 */
function splitIntoTweets(content: string): string[] {
  if (!content.trim()) return [""];

  const tweets: string[] = [];
  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const para of paragraphs) {
    if (para.length <= TWITTER_MAX) {
      tweets.push(para);
    } else {
      let remaining = para;
      while (remaining.length > TWITTER_MAX) {
        tweets.push(remaining.slice(0, TWITTER_MAX));
        remaining = remaining.slice(TWITTER_MAX).trim();
      }
      if (remaining) tweets.push(remaining);
    }
  }

  return tweets.length > 0 ? tweets : [""];
}

function getCharCountColor(count: number, max: number): string {
  const pct = count / max;
  if (pct >= 1) return "text-red-600 font-semibold";
  if (pct >= 0.9) return "text-amber-500";
  return "text-gray-400";
}

// ── Twitter Thread Editor ──────────────────────────────────────────────────────

interface TwitterThreadEditorProps {
  tweets: string[];
  readOnly: boolean;
  onTweetsChange: (tweets: string[]) => void;
}

function TwitterThreadEditor({
  tweets,
  readOnly,
  onTweetsChange,
}: TwitterThreadEditorProps) {
  const updateTweet = (index: number, value: string) => {
    const updated = [...tweets];
    updated[index] = value;
    onTweetsChange(updated);
  };

  const addTweet = () => {
    onTweetsChange([...tweets, ""]);
  };

  const removeTweet = (index: number) => {
    if (tweets.length <= 1) return;
    onTweetsChange(tweets.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-sky-700">
          𝕏 Thread Editor — {tweets.length} tweet{tweets.length !== 1 ? "s" : ""}
        </p>
        {!readOnly && (
          <button
            type="button"
            onClick={addTweet}
            className="text-xs text-sky-600 hover:text-sky-800 font-medium flex items-center gap-1"
          >
            + Add Tweet
          </button>
        )}
      </div>

      <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
        {tweets.map((tweet, i) => {
          const isOver = tweet.length > TWITTER_MAX;
          return (
            <div key={i} className="relative">
              {/* Tweet number + char count */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-sky-600">
                  Tweet {i + 1}/{tweets.length}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-[10px]",
                      getCharCountColor(tweet.length, TWITTER_MAX),
                    )}
                  >
                    {tweet.length}/{TWITTER_MAX}
                  </span>
                  {!readOnly && tweets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTweet(i)}
                      className="text-[10px] text-gray-400 hover:text-red-500"
                      title="Remove tweet"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={tweet}
                onChange={(e) => updateTweet(i, e.target.value)}
                disabled={readOnly}
                placeholder={i === 0 ? "Hook tweet…" : `Tweet ${i + 1}…`}
                rows={3}
                className={cn(
                  "w-full rounded-lg border p-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-sky-400",
                  isOver ? "border-red-300 focus:ring-red-400" : "border-sky-200",
                  readOnly && "bg-gray-50 text-gray-500 cursor-not-allowed",
                )}
              />
              {isOver && (
                <p className="text-[10px] text-red-500 mt-0.5">
                  Over 280 chars — split into another tweet
                </p>
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <button
          type="button"
          onClick={addTweet}
          className="w-full border-2 border-dashed border-sky-200 rounded-lg py-2 text-xs text-sky-500 hover:border-sky-400 hover:text-sky-700 transition-colors"
        >
          + Add another tweet
        </button>
      )}
    </div>
  );
}

export function PostEditorPane({
  content,
  platform,
  status,
  onChange,
  onSave,
  onMarkReady,
  saving = false,
  readOnly = false,
}: PostEditorPaneProps) {
  const isTwitter = platform === "twitter";
  const maxChars = isTwitter ? TWITTER_MAX : LINKEDIN_MAX;
  const charCount = content.length;
  const isOverLimit = charCount > maxChars;

  // Twitter thread editor state (#36)
  // When content exceeds 280 chars on Twitter, switch to thread editor mode.
  const [threadMode, setThreadMode] = useState(
    isTwitter && charCount > TWITTER_MAX,
  );
  const [threadTweets, setThreadTweets] = useState<string[]>(() =>
    isTwitter && charCount > TWITTER_MAX ? splitIntoTweets(content) : [""],
  );

  // Sync thread mode when content changes (e.g. AI applies content)
  useEffect(() => {
    if (isTwitter && content.length > TWITTER_MAX && !threadMode) {
      setThreadMode(true);
      setThreadTweets(splitIntoTweets(content));
    }
  }, [content, isTwitter, threadMode]);

  // When threadTweets change, sync back to parent content (joined by double newlines)
  const handleThreadChange = useCallback(
    (tweets: string[]) => {
      setThreadTweets(tweets);
      onChange(tweets.join("\n\n"));
    },
    [onChange],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // clipboard not available
    }
  }, [content]);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Platform + char counter header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
              isTwitter
                ? "bg-sky-100 text-sky-700"
                : "bg-indigo-100 text-indigo-700",
            )}
          >
            {isTwitter ? "𝕏 Twitter/X" : "in LinkedIn"}
          </span>
          {!isTwitter && (
            <span
              className={cn(
                "text-xs",
                getCharCountColor(charCount, maxChars),
              )}
            >
              {charCount.toLocaleString()} / {maxChars.toLocaleString()} chars
            </span>
          )}
          {isTwitter && !threadMode && (
            <span
              className={cn(
                "text-xs",
                getCharCountColor(charCount, maxChars),
              )}
            >
              {charCount}/{TWITTER_MAX}
            </span>
          )}
          {isOverLimit && !isTwitter && (
            <span className="text-xs text-red-500">Over limit!</span>
          )}
          {/* Thread mode toggle */}
          {isTwitter && (
            <button
              type="button"
              onClick={() => {
                if (!threadMode) {
                  setThreadTweets(splitIntoTweets(content));
                } else {
                  // Merge back into single content
                  onChange(threadTweets.join("\n\n"));
                }
                setThreadMode((m) => !m);
              }}
              className="text-[10px] text-sky-600 hover:text-sky-800 underline"
            >
              {threadMode ? "Single tweet mode" : "Thread editor mode"}
            </button>
          )}
        </div>

        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            status === "published"
              ? "bg-green-100 text-green-700"
              : status === "ready"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-500",
          )}
        >
          {status === "published"
            ? "✓ Finalized"
            : status === "ready"
              ? "Ready"
              : "Drafting"}
        </span>
      </div>

      {/* ── Twitter thread editor ────────────────────────────────────────────── */}
      {isTwitter && threadMode ? (
        <TwitterThreadEditor
          tweets={threadTweets}
          readOnly={readOnly || status === "published"}
          onTweetsChange={handleThreadChange}
        />
      ) : (
        /* ── Standard textarea (LinkedIn or single tweet) ───────────────────── */
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            isTwitter
              ? "Write your tweet here (≤280 chars). Switch to Thread editor for longer content."
              : "Start writing your LinkedIn post here, or ask the AI to write it for you →"
          }
          disabled={readOnly || status === "published"}
          className={cn(
            "flex-1 w-full rounded-lg border p-4 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400",
            isOverLimit && !isTwitter
              ? "border-red-300 focus:ring-red-400"
              : "border-gray-200",
            isTwitter && isOverLimit
              ? "border-amber-300 focus:ring-amber-400"
              : "",
            (readOnly || status === "published") &&
              "bg-gray-50 text-gray-500 cursor-not-allowed",
          )}
          style={{ minHeight: "340px" }}
        />
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || status === "published"}
          className="flex-1"
        >
          {saving ? "Saving…" : "💾 Save Draft"}
        </Button>

        {status !== "published" && (
          <Button
            variant="outline"
            size="sm"
            onClick={onMarkReady}
            disabled={saving || status === "ready"}
            className="flex-1"
          >
            {status === "ready" ? "✓ Ready" : "✅ Mark Ready"}
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="shrink-0"
          title="Copy to clipboard"
        >
          📋
        </Button>
      </div>
    </div>
  );
}
