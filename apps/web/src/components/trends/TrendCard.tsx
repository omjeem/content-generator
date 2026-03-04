"use client";

import type { IDiscoveryTrend } from "@repo/shared-types";

interface TrendCardProps {
  trend: IDiscoveryTrend;
  selected: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
}

export function TrendCard({ trend, selected, disabled, onToggle }: TrendCardProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onToggle(trend.id)}
      disabled={disabled && !selected}
      className={`w-full text-left rounded-lg border p-4 transition-all ${
        selected
          ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300"
          : disabled
            ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
            : "border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30 cursor-pointer"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
            selected
              ? "border-indigo-600 bg-indigo-600 text-white"
              : "border-gray-300"
          }`}
        >
          {selected && (
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Topic title */}
          <p className="font-medium text-gray-900 text-sm leading-snug">
            {trend.topic}
          </p>

          {/* Metadata row */}
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            {trend.source && (
              <span className="inline-flex items-center text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {trend.source}
              </span>
            )}
            <span className="inline-flex items-center text-xs font-medium text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
              {trend.category}
            </span>
          </div>

          {/* Relevance reason */}
          <p className="mt-2 text-xs text-gray-500 leading-relaxed">
            {trend.relevanceReason}
          </p>

          {/* Content angle */}
          <p className="mt-1 text-xs text-indigo-600 leading-relaxed">
            <span className="font-medium">Angle:</span> {trend.contentAngle}
          </p>
        </div>
      </div>
    </button>
  );
}
