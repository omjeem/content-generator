"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ISuggestion } from "@repo/shared-types";
import { feedbackApi } from "@/lib/api";
import type { FeedbackRating, FeedbackAction } from "@/lib/api";

interface SuggestionCardProps {
  suggestion: ISuggestion;
  index: number;
  /** If provided, enables the feedback UI (requires a saved suggestion set) */
  suggestionSetId?: string;
}

const formatLabels: Record<string, string> = {
  carousel: "Carousel",
  "text-post": "Text Post",
  poll: "Poll",
  "video-script": "Video Script",
  list: "List Post",
  tweet: "Tweet",
  thread: "Thread",
  "quote-tweet": "Quote Tweet",
  "image-tweet": "Image Tweet",
};

// Rating options with emoji + label
const RATINGS: { value: FeedbackRating; emoji: string; label: string }[] = [
  { value: "loved", emoji: "❤️", label: "Loved" },
  { value: "good", emoji: "👍", label: "Good" },
  { value: "meh", emoji: "😐", label: "Meh" },
  { value: "bad", emoji: "👎", label: "Bad" },
];

// Action options
const ACTIONS: { value: FeedbackAction; emoji: string; label: string }[] = [
  { value: "saved", emoji: "📌", label: "Save" },
  { value: "draft", emoji: "✏️", label: "Write Draft" },
  { value: "dismissed", emoji: "❌", label: "Dismiss" },
];

export function SuggestionCard({
  suggestion,
  index,
  suggestionSetId,
}: SuggestionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [briefCopied, setBriefCopied] = useState(false);

  // Feedback state
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState<FeedbackRating | null>(
    null,
  );
  const [selectedAction, setSelectedAction] = useState<FeedbackAction | null>(
    null,
  );
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const hasRichContent = !!(
    suggestion.seoKeywords?.length ||
    suggestion.clickbaitHooks?.length ||
    suggestion.postPointers?.length ||
    suggestion.callToAction
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(suggestion.hook);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }

  async function handleCopyBrief() {
    try {
      const lines: string[] = [];
      lines.push(`HOOK: ${suggestion.hook}`);
      lines.push(`TOPIC: ${suggestion.topic}`);
      lines.push(`ANGLE: ${suggestion.angle}`);
      lines.push(
        `FORMAT: ${formatLabels[suggestion.format] ?? suggestion.format}`,
      );

      if (suggestion.postPointers?.length) {
        lines.push("\nPOST OUTLINE:");
        suggestion.postPointers.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
      }

      if (suggestion.clickbaitHooks?.length) {
        lines.push("\nALT HOOKS:");
        suggestion.clickbaitHooks.forEach((h) => lines.push(`• ${h}`));
      }

      if (suggestion.callToAction) {
        lines.push(`\nCTA: ${suggestion.callToAction}`);
      }

      if (suggestion.seoKeywords?.length) {
        lines.push(`\nKEYWORDS: ${suggestion.seoKeywords.join(" ")}`);
      }

      await navigator.clipboard.writeText(lines.join("\n"));
      setBriefCopied(true);
      setTimeout(() => setBriefCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }

  async function handleSubmitFeedback() {
    if (!suggestionSetId || !selectedAction) return;

    setFeedbackSubmitting(true);
    setFeedbackError(null);

    try {
      await feedbackApi.submit(suggestionSetId, {
        suggestionIndex: index,
        action: selectedAction,
        rating: selectedRating ?? undefined,
        feedbackText: feedbackText.trim() || undefined,
      });
      setFeedbackSubmitted(true);
    } catch {
      setFeedbackError("Failed to save feedback. Please try again.");
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400">
              #{index + 1}
            </span>
            <Badge variant="format" format={suggestion.format}>
              {formatLabels[suggestion.format] ?? suggestion.format}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className={cn(
              "text-xs shrink-0",
              copied ? "text-green-600" : "text-gray-500",
            )}
          >
            {copied ? "✓ Copied!" : "Copy Hook"}
          </Button>
        </div>

        {/* Hook — the scroll-stopper */}
        <blockquote className="text-base font-semibold text-gray-900 leading-snug mb-3 border-l-4 border-indigo-600 pl-3">
          &ldquo;{suggestion.hook}&rdquo;
        </blockquote>

        {/* Topic + Angle */}
        <div className="space-y-1 mb-3">
          <p className="text-sm">
            <span className="font-medium text-gray-700">Topic: </span>
            <span className="text-gray-600">{suggestion.topic}</span>
          </p>
          <p className="text-sm">
            <span className="font-medium text-gray-700">Angle: </span>
            <span className="text-gray-600">{suggestion.angle}</span>
          </p>
        </div>

        {/* Expandable "Why it fits" */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-indigo-600 hover:underline font-medium"
        >
          {expanded ? "▲ Hide" : "▼ Why this fits your voice"}
        </button>

        {expanded && (
          <p className="mt-2 text-sm text-gray-600 bg-blue-50 rounded-lg p-3 leading-relaxed">
            {suggestion.whyItFits}
          </p>
        )}

        {/* Full Content Brief — expandable section */}
        {hasRichContent && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setBriefExpanded((prev) => !prev);
              }}
              className="flex items-center justify-between w-full text-xs font-semibold text-gray-700 hover:text-gray-900 group"
            >
              <span className="flex items-center gap-1.5">
                <span className="text-base">📋</span>
                Full Content Brief
              </span>
              <span className="text-gray-400 group-hover:text-gray-600">
                {briefExpanded ? "▲" : "▼"}
              </span>
            </button>

            {briefExpanded && (
              <div className="mt-3 space-y-4">
                {/* Post outline */}
                {suggestion.postPointers &&
                  suggestion.postPointers.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Post Outline
                      </h4>
                      <ol className="space-y-1.5">
                        {suggestion.postPointers.map((point, i) => (
                          <li
                            key={i}
                            className="flex gap-2 text-sm text-gray-700"
                          >
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-600/10 text-indigo-600 text-xs font-semibold flex items-center justify-center mt-0.5">
                              {i + 1}
                            </span>
                            <span className="leading-relaxed">{point}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                {/* Alt hooks */}
                {suggestion.clickbaitHooks &&
                  suggestion.clickbaitHooks.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Alt Hooks (Bolder Options)
                      </h4>
                      <div className="space-y-1.5">
                        {suggestion.clickbaitHooks.map((hook, i) => (
                          <div key={i} className="flex gap-2 items-start">
                            <span className="text-amber-400 text-xs mt-0.5">
                              ⚡
                            </span>
                            <p className="text-sm text-gray-700 italic leading-relaxed">
                              &ldquo;{hook}&rdquo;
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* CTA */}
                {suggestion.callToAction && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Call to Action
                    </h4>
                    <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2">
                      <p className="text-sm text-green-800">
                        {suggestion.callToAction}
                      </p>
                    </div>
                  </div>
                )}

                {/* SEO keywords */}
                {suggestion.seoKeywords &&
                  suggestion.seoKeywords.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        SEO Keywords & Hashtags
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestion.seoKeywords.map((kw, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center rounded-full bg-indigo-600/10 text-indigo-600 text-xs font-medium px-2.5 py-0.5"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Copy full brief button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={handleCopyBrief}
                >
                  {briefCopied ? "✓ Brief Copied!" : "📋 Copy Full Brief"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Feedback Section (#17) ─────────────────────────────────────────── */}
        {suggestionSetId && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            {feedbackSubmitted ? (
              /* Confirmation state */
              <div className="flex items-center gap-2 text-green-600 text-xs font-medium py-1">
                <span>✓</span>
                <span>Feedback saved — thanks!</span>
              </div>
            ) : (
              <>
                {/* Toggle row */}
                <button
                  onClick={() => setFeedbackOpen((o) => !o)}
                  className="flex items-center justify-between w-full text-xs text-gray-500 hover:text-gray-700 group"
                >
                  <span className="flex items-center gap-1.5">
                    <span>💬</span>
                    <span className="font-medium">Rate this idea</span>
                  </span>
                  <span className="text-gray-400 group-hover:text-gray-600">
                    {feedbackOpen ? "▲" : "▼"}
                  </span>
                </button>

                {feedbackOpen && (
                  <div className="mt-3 space-y-3">
                    {/* Row 1: Quality rating */}
                    <div>
                      <p className="text-xs text-gray-500 mb-1.5 font-medium">
                        How good is this idea?
                      </p>
                      <div className="flex gap-1.5">
                        {RATINGS.map(({ value, emoji, label }) => (
                          <button
                            key={value}
                            onClick={() =>
                              setSelectedRating((r) =>
                                r === value ? null : value,
                              )
                            }
                            className={cn(
                              "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors",
                              selectedRating === value
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-400",
                            )}
                            title={label}
                          >
                            <span>{emoji}</span>
                            <span className="hidden sm:inline">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Row 2: Action */}
                    <div>
                      <p className="text-xs text-gray-500 mb-1.5 font-medium">
                        What will you do with it?
                      </p>
                      <div className="flex gap-1.5 flex-wrap">
                        {ACTIONS.map(({ value, emoji, label }) => (
                          <button
                            key={value}
                            onClick={() =>
                              setSelectedAction((a) =>
                                a === value ? null : value,
                              )
                            }
                            className={cn(
                              "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors",
                              selectedAction === value
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-400",
                            )}
                          >
                            <span>{emoji}</span>
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Optional free-text (shown once a rating/action is selected) */}
                    {(selectedRating || selectedAction) && (
                      <div>
                        <textarea
                          placeholder="Any specific notes? (optional)"
                          value={feedbackText}
                          onChange={(e) => setFeedbackText(e.target.value)}
                          maxLength={1000}
                          rows={2}
                          className="w-full text-xs rounded-md border border-gray-200 px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder-gray-400"
                        />
                      </div>
                    )}

                    {/* Error message */}
                    {feedbackError && (
                      <p className="text-xs text-red-500">{feedbackError}</p>
                    )}

                    {/* Submit button — only enabled when an action is selected */}
                    <Button
                      size="sm"
                      className="w-full text-xs"
                      disabled={!selectedAction || feedbackSubmitting}
                      onClick={handleSubmitFeedback}
                    >
                      {feedbackSubmitting
                        ? "Saving…"
                        : "Submit Feedback"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
