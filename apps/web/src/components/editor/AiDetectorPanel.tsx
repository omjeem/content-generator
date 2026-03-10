"use client";

/**
 * AiDetectorModal — Phase 3 #39 (revised)
 *
 * Modal overlay for AI detection + humanization.
 * Triggered from a toolbar button in the editor page.
 * Shows score, verdict, signals, suggestions, and a humanize flow.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { draftsApi, ApiError } from "@/lib/api";
import type { IAiCheckResponse, HumanizeIntensity } from "@repo/shared-types";

interface AiDetectorModalProps {
  draftId: string;
  content: string;
  disabled?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onContentUpdated: (newContent: string) => void;
}

const INTENSITY_OPTIONS: {
  value: HumanizeIntensity;
  label: string;
  desc: string;
}[] = [
  {
    value: "light",
    label: "Light",
    desc: "Fix obvious AI patterns, keep 80% wording",
  },
  {
    value: "moderate",
    label: "Moderate",
    desc: "Significant rewrite, add personal touches",
  },
  {
    value: "aggressive",
    label: "Aggressive",
    desc: "Complete rewrite in your voice",
  },
];

function ScoreBar({ score }: { score: number }) {
  const color =
    score <= 30
      ? "bg-green-500"
      : score <= 60
        ? "bg-amber-500"
        : "bg-red-500";

  const textColor =
    score <= 30
      ? "text-green-700"
      : score <= 60
        ? "text-amber-700"
        : "text-red-700";

  const bgRing =
    score <= 30
      ? "bg-green-50 border-green-200"
      : score <= 60
        ? "bg-amber-50 border-amber-200"
        : "bg-red-50 border-red-200";

  return (
    <div className={`rounded-lg border p-4 ${bgRing}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-2xl font-bold ${textColor}`}>{score}/100</span>
        <span
          className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${
            score <= 30
              ? "bg-green-100 text-green-700"
              : score <= 60
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-700"
          }`}
        >
          {score <= 30 ? "Likely Human" : score <= 60 ? "Mixed" : "Likely AI"}
        </span>
      </div>
      <div className="w-full h-3 bg-white/60 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

export function AiDetectorModal({
  draftId,
  content,
  disabled,
  isOpen,
  onClose,
  onContentUpdated,
}: AiDetectorModalProps) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<IAiCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Humanize state
  const [showHumanize, setShowHumanize] = useState(false);
  const [intensity, setIntensity] = useState<HumanizeIntensity>("moderate");
  const [humanizing, setHumanizing] = useState(false);
  const [humanizeResult, setHumanizeResult] = useState<{
    beforeScore: number;
    afterScore: number;
    changesSummary: string;
  } | null>(null);

  const humanizeRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to humanize panel when it appears
  useEffect(() => {
    if (showHumanize && humanizeRef.current) {
      humanizeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [showHumanize]);

  const handleCheck = useCallback(async () => {
    if (checking || !content.trim()) return;
    setChecking(true);
    setError(null);
    setResult(null);
    setHumanizeResult(null);

    try {
      const res = await draftsApi.aiCheck(draftId, content);
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "AI detection failed. Please try again.",
      );
    } finally {
      setChecking(false);
    }
  }, [draftId, content, checking]);

  const handleHumanize = useCallback(async () => {
    if (humanizing) return;
    setHumanizing(true);
    setError(null);

    try {
      const res = await draftsApi.humanize(draftId, intensity);
      onContentUpdated(res.humanizedContent);
      setHumanizeResult({
        beforeScore: res.beforeScore,
        afterScore: res.afterScore,
        changesSummary: res.changesSummary,
      });
      setShowHumanize(false);
      // Clear the old AI check result — content has changed
      setResult(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Humanization failed. Please try again.",
      );
    } finally {
      setHumanizing(false);
    }
  }, [draftId, intensity, humanizing, onContentUpdated]);

  const handleClose = () => {
    // Don't close while processing
    if (checking || humanizing) return;
    onClose();
  };

  if (!isOpen) return null;

  const contentTooShort = !content.trim() || content.trim().length < 50;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 rounded-t-2xl px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <span className="text-lg">🔍</span> AI Detection & Humanizer
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Check if your post sounds AI-generated
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={checking || humanizing}
            className="text-gray-400 hover:text-gray-600 text-lg p-1 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div ref={scrollAreaRef} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Initial state — run check */}
          {!result && !checking && (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">🤖</div>
              <p className="text-sm text-gray-600 mb-1">
                Analyze your post for AI-generated patterns
              </p>
              <p className="text-xs text-gray-400 mb-5">
                Our 7-signal analysis checks sentence structure, vocabulary,
                tone, and more
              </p>
              <Button
                size="lg"
                onClick={handleCheck}
                disabled={disabled || contentTooShort}
                className="px-6"
              >
                Run AI Detection
              </Button>
              {contentTooShort && (
                <p className="text-xs text-gray-400 mt-2">
                  Need at least 50 characters to analyze
                </p>
              )}
            </div>
          )}

          {/* Checking spinner — full modal loading state */}
          {checking && (
            <div className="text-center py-10">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-indigo-50 mb-4">
                <div className="animate-spin rounded-full h-7 w-7 border-[3px] border-indigo-600 border-t-transparent" />
              </div>
              <p className="text-sm font-medium text-gray-700">
                Analyzing content…
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Running 7-signal detection analysis
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <>
              <ScoreBar score={result.score} />

              {/* Signals */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Signals Detected
                </p>
                <ul className="space-y-2">
                  {result.signals.map((signal, i) => (
                    <li
                      key={i}
                      className="text-sm text-gray-600 flex items-start gap-2"
                    >
                      <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
                      {signal}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Suggestions */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Suggestions
                </p>
                <ul className="space-y-2">
                  {result.suggestions.map((sug, i) => (
                    <li
                      key={i}
                      className="text-sm text-gray-600 flex items-start gap-2"
                    >
                      <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                      {sug}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCheck}
                  disabled={checking}
                  className="flex-1"
                >
                  Re-check
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowHumanize(true)}
                  disabled={humanizing}
                  className="flex-1"
                >
                  ✨ Humanize Post
                </Button>
              </div>
            </>
          )}

          {/* Humanize panel */}
          {showHumanize && (
            <div ref={humanizeRef} className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">
                Humanization Intensity
              </p>
              <div className="space-y-2">
                {INTENSITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setIntensity(opt.value)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${
                      intensity === opt.value
                        ? "bg-indigo-100 text-indigo-700 border-2 border-indigo-300 shadow-sm"
                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-gray-400 ml-1.5 text-xs">
                      — {opt.desc}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowHumanize(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleHumanize}
                  disabled={humanizing}
                  className="flex-1"
                >
                  {humanizing ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                      Humanizing…
                    </span>
                  ) : (
                    "Apply"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Humanize in-progress full state (when not in humanize panel) */}
          {humanizing && !showHumanize && (
            <div className="text-center py-10">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-purple-50 mb-4">
                <div className="animate-spin rounded-full h-7 w-7 border-[3px] border-purple-600 border-t-transparent" />
              </div>
              <p className="text-sm font-medium text-gray-700">
                Humanizing your post…
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Rewriting in your personal voice
              </p>
            </div>
          )}

          {/* Humanize success banner */}
          {humanizeResult && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-1.5">
              <p className="text-sm font-semibold text-green-700 flex items-center gap-1.5">
                <span>✓</span> Content humanized successfully
              </p>
              <p className="text-xs text-green-600 flex items-center gap-2">
                <span className="font-medium">AI score:</span>
                <span className="line-through text-red-400">
                  {humanizeResult.beforeScore}
                </span>
                <span>→</span>
                <span className="font-bold text-green-700">
                  {humanizeResult.afterScore}
                </span>
              </p>
              <p className="text-xs text-green-600">
                {humanizeResult.changesSummary}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
