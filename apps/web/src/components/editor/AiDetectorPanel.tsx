"use client";

/**
 * AiDetectorPanel — Phase 3 #39
 *
 * Collapsible panel for AI detection + humanization in the post editor.
 * Shows score, verdict, signals, suggestions, and a humanize button.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { draftsApi, ApiError } from "@/lib/api";
import type { IAiCheckResponse, HumanizeIntensity } from "@repo/shared-types";

interface AiDetectorPanelProps {
  draftId: string;
  content: string;
  disabled?: boolean;
  onContentUpdated: (newContent: string) => void;
}

const INTENSITY_OPTIONS: { value: HumanizeIntensity; label: string; desc: string }[] = [
  { value: "light", label: "Light", desc: "Fix obvious AI patterns, keep 80% wording" },
  { value: "moderate", label: "Moderate", desc: "Significant rewrite, add personal touches" },
  { value: "aggressive", label: "Aggressive", desc: "Complete rewrite in your voice" },
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

  return (
    <div className="space-y-1">
      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="flex justify-between">
        <span className={`text-sm font-bold ${textColor}`}>{score}/100</span>
        <span className={`text-xs font-medium ${textColor}`}>
          {score <= 30
            ? "Likely Human"
            : score <= 60
              ? "Mixed"
              : "Likely AI"}
        </span>
      </div>
    </div>
  );
}

export function AiDetectorPanel({
  draftId,
  content,
  disabled,
  onContentUpdated,
}: AiDetectorPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        className="w-full text-left text-xs font-medium text-gray-500 hover:text-indigo-600 transition-colors py-2 px-3 border border-gray-200 rounded-lg hover:border-indigo-300 disabled:opacity-50"
      >
        🔍 AI Detection & Humanizer
      </button>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-700">
          🔍 AI Detection & Humanizer
        </span>
        <button
          onClick={() => setIsOpen(false)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Check button */}
        {!result && !checking && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={handleCheck}
            disabled={disabled || !content.trim() || content.trim().length < 50}
          >
            Run AI Detection
          </Button>
        )}

        {/* Checking spinner */}
        {checking && (
          <div className="flex items-center justify-center gap-2 py-4">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent" />
            <span className="text-xs text-gray-500">Analyzing content…</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            <ScoreBar score={result.score} />

            {/* Signals */}
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Signals Detected
              </p>
              <ul className="space-y-1">
                {result.signals.map((signal, i) => (
                  <li
                    key={i}
                    className="text-xs text-gray-600 flex items-start gap-1.5"
                  >
                    <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
                    {signal}
                  </li>
                ))}
              </ul>
            </div>

            {/* Suggestions */}
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Suggestions
              </p>
              <ul className="space-y-1">
                {result.suggestions.map((sug, i) => (
                  <li
                    key={i}
                    className="text-xs text-gray-600 flex items-start gap-1.5"
                  >
                    <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                    {sug}
                  </li>
                ))}
              </ul>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
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
                Humanize Post
              </Button>
            </div>
          </>
        )}

        {/* Humanize panel */}
        {showHumanize && (
          <div className="bg-gray-50 rounded-md p-3 space-y-2">
            <p className="text-xs font-medium text-gray-700">
              Humanization Intensity
            </p>
            <div className="space-y-1">
              {INTENSITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setIntensity(opt.value)}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors ${
                    intensity === opt.value
                      ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                      : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-gray-400 ml-1">— {opt.desc}</span>
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
                {humanizing ? "Humanizing…" : "Apply"}
              </Button>
            </div>
          </div>
        )}

        {/* Humanize success banner */}
        {humanizeResult && (
          <div className="bg-green-50 border border-green-200 rounded-md px-3 py-2 space-y-1">
            <p className="text-xs font-medium text-green-700">
              ✓ Content humanized
            </p>
            <p className="text-[10px] text-green-600">
              AI score: {humanizeResult.beforeScore} → {humanizeResult.afterScore}
            </p>
            <p className="text-[10px] text-green-600">
              {humanizeResult.changesSummary}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
