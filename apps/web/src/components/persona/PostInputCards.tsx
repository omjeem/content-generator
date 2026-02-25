"use client";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PostInputCardsProps {
  /** Called when the user submits valid posts */
  onSubmit: (posts: string[]) => void;
  /** Whether the parent is loading (disables inputs + submit) */
  loading?: boolean;
  /** Max number of posts allowed */
  maxPosts?: number;
  /** Minimum characters per post */
  minCharsPerPost?: number;
  /** Label on the submit button */
  submitLabel?: string;
}

const MIN_CHARS = 30;
const MAX_POSTS = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

function splitBulkPaste(text: string): string[] {
  // Split on common post separators: blank lines, ---, ===, or numbered "1."
  const raw = text
    .split(/\n{2,}|(?:^|\n)\s*[-=]{3,}\s*(?:\n|$)|(?:^|\n)\s*\d+\.\s+/m)
    .map((p) => p.trim())
    .filter((p) => p.length >= MIN_CHARS);
  return raw;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PostInputCards({
  onSubmit,
  loading = false,
  maxPosts = MAX_POSTS,
  minCharsPerPost = MIN_CHARS,
  submitLabel = "Analyze Posts",
}: PostInputCardsProps) {
  const [posts, setPosts] = useState<string[]>([""]);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});

  // ── Card operations ─────────────────────────────────────────────────────────

  const updatePost = useCallback((index: number, value: string) => {
    setPosts((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    // Clear error on edit
    setErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, []);

  const addCard = useCallback(() => {
    if (posts.length < maxPosts) {
      setPosts((prev) => [...prev, ""]);
    }
  }, [posts.length, maxPosts]);

  const removeCard = useCallback((index: number) => {
    setPosts((prev) => prev.filter((_, i) => i !== index));
    setErrors((prev) => {
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        const ki = Number(k);
        if (ki < index) next[ki] = v;
        else if (ki > index) next[ki - 1] = v;
      }
      return next;
    });
  }, []);

  // ── Bulk paste ──────────────────────────────────────────────────────────────

  const handleBulkTextChange = (text: string) => {
    setBulkText(text);
    const split = splitBulkPaste(text);
    setBulkPreview(split.slice(0, maxPosts));
  };

  const applyBulkPaste = () => {
    if (bulkPreview.length > 0) {
      setPosts(bulkPreview);
      setErrors({});
      setBulkMode(false);
      setBulkText("");
      setBulkPreview([]);
    }
  };

  // ── Validation & submit ──────────────────────────────────────────────────────

  const validate = (): boolean => {
    const newErrors: Record<number, string> = {};
    posts.forEach((post, i) => {
      if (post.trim().length < minCharsPerPost) {
        newErrors[i] = `Post must be at least ${minCharsPerPost} characters`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    const validPosts = posts.filter((p) => p.trim().length >= minCharsPerPost);
    if (validPosts.length === 0) {
      setErrors({
        0: `Please enter at least one post with ${minCharsPerPost}+ characters`,
      });
      return;
    }
    if (!validate()) return;
    onSubmit(validPosts.map((p) => p.trim()));
  };

  // ── Char count helper ────────────────────────────────────────────────────────

  const charCountColor = (post: string) => {
    const len = post.length;
    if (len < minCharsPerPost) return "text-red-500";
    if (len > 3000) return "text-amber-500";
    return "text-gray-400";
  };

  const validPostCount = posts.filter(
    (p) => p.trim().length >= minCharsPerPost,
  ).length;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {bulkMode
            ? "Paste all posts at once — we'll split them automatically"
            : `Add up to ${maxPosts} posts, one per card`}
        </p>
        <button
          type="button"
          onClick={() => {
            setBulkMode((b) => !b);
            setBulkText("");
            setBulkPreview([]);
          }}
          className="text-xs text-indigo-600 hover:underline font-medium"
        >
          {bulkMode ? "← Card mode" : "Bulk paste →"}
        </button>
      </div>

      {/* Bulk paste mode */}
      {bulkMode ? (
        <div className="space-y-3">
          <textarea
            value={bulkText}
            onChange={(e) => handleBulkTextChange(e.target.value)}
            disabled={loading}
            placeholder={`Paste all your LinkedIn posts here.\n\nSeparate each post with a blank line, ---, or number them like:\n1. Post one text...\n2. Post two text...`}
            rows={12}
            className={cn(
              "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm",
              "placeholder:text-gray-400 resize-none font-mono",
              "focus:outline-none focus:ring-2 focus:ring-linkedin focus:border-transparent",
              "disabled:opacity-50",
            )}
          />
          {bulkPreview.length > 0 && (
            <div className="rounded-lg border border-indigo-600/20 bg-blue-50 p-3 space-y-1">
              <p className="text-xs font-medium text-indigo-600">
                Preview — {bulkPreview.length} post
                {bulkPreview.length !== 1 ? "s" : ""} detected:
              </p>
              {bulkPreview.slice(0, 3).map((p, i) => (
                <p key={i} className="text-xs text-gray-600 truncate">
                  {i + 1}. {p.slice(0, 80)}
                  {p.length > 80 ? "…" : ""}
                </p>
              ))}
              {bulkPreview.length > 3 && (
                <p className="text-xs text-gray-400">
                  …and {bulkPreview.length - 3} more
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={applyBulkPaste}
                disabled={loading}
                className="mt-2 text-indigo-600 border-indigo-600 hover:bg-indigo-600/5"
              >
                Use these {bulkPreview.length} posts →
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* Card mode */
        <div className="space-y-3">
          {posts.map((post, index) => (
            <div
              key={index}
              className={cn(
                "relative rounded-xl border bg-white p-4 shadow-sm transition-colors",
                errors[index]
                  ? "border-red-300"
                  : "border-gray-200 hover:border-gray-300",
              )}
            >
              {/* Card header */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Post {index + 1}
                </span>
                {posts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCard(index)}
                    disabled={loading}
                    className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40 text-lg leading-none"
                    aria-label="Remove post"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Textarea */}
              <textarea
                value={post}
                onChange={(e) => updatePost(index, e.target.value)}
                disabled={loading}
                placeholder="Paste a LinkedIn post here..."
                rows={4}
                className={cn(
                  "w-full rounded-md border-0 bg-gray-50 px-3 py-2 text-sm resize-none",
                  "placeholder:text-gray-400",
                  "focus:outline-none focus:ring-2 focus:ring-linkedin",
                  "disabled:opacity-50",
                )}
              />

              {/* Footer: error + char count */}
              <div className="flex items-center justify-between mt-1.5">
                {errors[index] ? (
                  <p className="text-xs text-red-500">{errors[index]}</p>
                ) : (
                  <span />
                )}
                <span
                  className={cn("text-xs tabular-nums", charCountColor(post))}
                >
                  {post.length} chars
                </span>
              </div>
            </div>
          ))}

          {/* Add card button */}
          {posts.length < maxPosts && (
            <button
              type="button"
              onClick={addCard}
              disabled={loading}
              className={cn(
                "w-full rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm text-gray-400",
                "hover:border-indigo-600 hover:text-indigo-600 transition-colors",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              + Add another post
              <span className="ml-1 text-xs text-gray-300">
                ({posts.length}/{maxPosts})
              </span>
            </button>
          )}
        </div>
      )}

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        loading={loading}
        disabled={
          loading ||
          (bulkMode &&
            bulkPreview.length === 0 &&
            bulkText.length < minCharsPerPost)
        }
        className="w-full"
      >
        {loading
          ? "Analyzing..."
          : `${submitLabel} (${validPostCount} post${validPostCount !== 1 ? "s" : ""})`}
      </Button>
    </div>
  );
}
