"use client";

/**
 * PostEditorPane — Phase D #25
 *
 * The left pane of the editor page. Contains:
 * - Controlled textarea with real-time character count
 * - Platform-aware char counter (LinkedIn 3000 / Twitter 280)
 * - Twitter thread preview when content >280 chars on Twitter platform
 * - Save Draft, Mark Ready, Copy to Clipboard buttons
 */

import { useCallback } from "react";
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
 * Split content into tweet-sized chunks (≤280 chars).
 * Splits on sentence boundaries first, then hard-cuts if needed.
 */
function splitIntoTweets(content: string): string[] {
  if (!content.trim()) return [];

  const tweets: string[] = [];
  // Split on double newlines first (paragraphs)
  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const para of paragraphs) {
    if (para.length <= TWITTER_MAX) {
      tweets.push(para);
    } else {
      // Hard split at TWITTER_MAX
      let remaining = para;
      while (remaining.length > TWITTER_MAX) {
        tweets.push(remaining.slice(0, TWITTER_MAX));
        remaining = remaining.slice(TWITTER_MAX).trim();
      }
      if (remaining) tweets.push(remaining);
    }
  }

  return tweets;
}

function getCharCountColor(count: number, max: number): string {
  const pct = count / max;
  if (pct >= 1) return "text-red-600 font-semibold";
  if (pct >= 0.9) return "text-amber-500";
  return "text-gray-400";
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

  const tweets = isTwitter && charCount > TWITTER_MAX ? splitIntoTweets(content) : [];
  const showThreadPreview = isTwitter && tweets.length > 1;

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
          <span
            className={cn(
              "text-xs",
              getCharCountColor(charCount, maxChars),
            )}
          >
            {charCount.toLocaleString()} / {maxChars.toLocaleString()} chars
          </span>
          {isOverLimit && !isTwitter && (
            <span className="text-xs text-red-500">Over limit!</span>
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
          {status === "published" ? "✓ Published" : status === "ready" ? "Ready" : "Drafting"}
        </span>
      </div>

      {/* Main textarea */}
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          isTwitter
            ? "Write your tweet or thread here. AI will help you split it into tweets."
            : "Start writing your LinkedIn post here, or ask the AI to write it for you →"
        }
        disabled={readOnly || status === "published"}
        className={cn(
          "flex-1 w-full rounded-lg border p-4 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400",
          isOverLimit && !isTwitter
            ? "border-red-300 focus:ring-red-400"
            : "border-gray-200",
          (readOnly || status === "published") && "bg-gray-50 text-gray-500 cursor-not-allowed",
        )}
        style={{ minHeight: "340px" }}
      />

      {/* Twitter thread preview */}
      {showThreadPreview && (
        <div className="border border-sky-200 rounded-lg p-3 bg-sky-50">
          <p className="text-xs font-semibold text-sky-700 mb-2">
            Thread Preview ({tweets.length} tweets)
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {tweets.map((tweet, i) => (
              <div
                key={i}
                className="bg-white rounded-md p-2 border border-sky-100"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-sky-600 font-medium">
                    {i + 1}/{tweets.length}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      getCharCountColor(tweet.length, TWITTER_MAX),
                    )}
                  >
                    {tweet.length}/280
                  </span>
                </div>
                <p className="text-xs text-gray-700 leading-relaxed">{tweet}</p>
              </div>
            ))}
          </div>
        </div>
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
